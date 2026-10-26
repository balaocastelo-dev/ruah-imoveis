// Portal RUAH · a régua da página do imóvel, em forma de código.
//
// Ninguém lê a página antes de ela ir ao ar. Por isso o texto pode MENOS do que
// um anúncio revisado, e quem garante é esta régua — aplicada no comando de
// publicar E de novo pelo site, contra a ficha do imóvel AO VIVO. Se a ficha
// mudar (ex.: o corretor corrige de 3 para 2 suítes) e o texto passar a
// contradizê-la, a página sai do ar até ser reescrita: o portal nunca mostra
// um texto que discorda dos números.
//
// `erros` reprovam; `avisos` são recomendações.
//
//   avaliarPagina(pagina, imovel, { modo })
//     imovel = { codigo, tipo, quartos, suites, vagas, area_util, area_total, fotos: [ids] }
//     modo   = 'publicar' (rigoroso com as fotos) | 'site' (fotos novas ou apagadas não derrubam a página)

const { slugTerminaNoCodigo } = require('./config');
const { contarPalavras, textoPuro, linksDoTexto, semAcento } = require('../blog/texto');

const PALAVRAS = { minimo: 300, teto: 1000 };

function textosDoBloco(b) {
  switch (b.tipo) {
    case 'paragrafo': return [textoPuro(b.texto)];
    case 'titulo': return [b.texto];
    case 'lista': case 'resumo': return [b.titulo || '', ...b.itens.map(textoPuro)];
    case 'destaque': return [b.titulo || '', textoPuro(b.texto)];
    case 'fotos': return b.fotos.map((f) => f.legenda);
    default: return [];
  }
}
const textosComLink = (b) => (b.tipo === 'paragrafo' || b.tipo === 'destaque' ? [b.texto] : b.tipo === 'lista' || b.tipo === 'resumo' ? b.itens : []);

/** Tudo o que o visitante lê, menos as legendas da galeria. */
function textoCorrido(p) {
  return [p.titulo, p.resumo, ...p.blocos.flatMap(textosDoBloco), ...(p.perguntas || []).flatMap((q) => [q.pergunta, q.resposta])].join('\n');
}
const palavrasDaPagina = (p) => p.blocos.flatMap(textosDoBloco).reduce((s, t) => s + contarPalavras(t), 0)
  + (p.perguntas || []).reduce((s, q) => s + contarPalavras(q.pergunta) + contarPalavras(q.resposta), 0);

const L = '\\p{L}*';
/** Preço, condição comercial e promessa ficam fora: o valor aparece da ficha, ao vivo. */
const PROIBIDOS = [
  { padrao: /R\$\s?\d|\b\d[\d.]*(?:,\d+)?\s*(?:mil|milh[õo]es?)(?:\s+de)?\s+reais/iu, nome: 'valor em reais (o preço aparece na ficha, ao vivo)' },
  { padrao: new RegExp(`sem juros|parcel${L}\\s+em|entrada\\s+de\\s+\\d|aceita\\s+(?:permuta|financiamento|fgts)|\\d\\s?%\\s+(?:de\\s+desconto|off)|desconto`, 'iu'), nome: 'condição comercial' },
  { padrao: new RegExp(`valoriza${L}\\s+garantid${L}|retorno\\s+garantid${L}|lucro\\s+garantid${L}|sem\\s+risco|investimento\\s+(?:100%\\s+)?seguro|garantimos|n[ãa]o\\s+tem\\s+como\\s+perder|vai\\s+valorizar`, 'iu'), nome: 'promessa de ganho ou de segurança' },
  { padrao: /imperd[íi]vel|oportunidade\s+[úu]nica|[úu]ltima\s+unidade|n[ãa]o\s+perca|corra|abaixo\s+do\s+(?:pre[çc]o|valor)\s+de\s+mercado|pre[çc]o\s+de\s+ocasi[ãa]o/iu, nome: 'apelo de urgência' },
  { padrao: /\b\d{5}-?\d{3}\b/, nome: 'CEP (o endereço exato não é publicado)' },
  { padrao: /\b(?:n[º°o]\.?|n[úu]mero)\s*\d+/iu, nome: 'número do endereço (o endereço exato não é publicado)' },
  { padrao: /\b(?:apto\.?|unidade|ap\.)\s*\d{1,4}\b/iu, nome: 'número da unidade (não se divulga, conforme a autorização de venda)' },
  { padrao: /\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b|@[a-z0-9.-]+\.[a-z]{2,}|https?:|www\./iu, nome: 'telefone, e-mail ou endereço de site (o contato é o formulário da página)' },
  { padrao: /(?<![\p{L}])(visitamos|estivemos\s+no|conhecemos\s+pessoalmente|testamos|medimos|em\s+nossa\s+visita)(?![\p{L}])/iu, nome: 'experiência própria que a rotina não teve (ela só viu as fotos)' },
];

const EXTENSO = { um: 1, uma: 1, dois: 2, duas: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };
const NUM = '(\\d{1,2}|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)';
const lerNumero = (s) => (/^\d+$/.test(s) ? Number(s) : EXTENSO[semAcento(s)] ?? EXTENSO[s.toLowerCase()]);

/** O texto nunca pode prometer mais quartos, suítes ou vagas, nem outra metragem, do que a ficha. */
function conferirNumeros(tudo, im, erros, avisos) {
  const campos = [
    { re: new RegExp(`(?<![\\p{L}\\d])${NUM}\\s+(?:quartos?|dormit[óo]rios?|dorms?\\.?)(?![\\p{L}])`, 'giu'), campo: 'quartos', nome: 'quartos' },
    { re: new RegExp(`(?<![\\p{L}\\d])${NUM}\\s+su[íi]tes?(?![\\p{L}])`, 'giu'), campo: 'suites', nome: 'suítes' },
    { re: new RegExp(`(?<![\\p{L}\\d])${NUM}\\s+vagas?(?![\\p{L}])`, 'giu'), campo: 'vagas', nome: 'vagas' },
  ];
  for (const { re, campo, nome } of campos) {
    for (const m of tudo.matchAll(re)) {
      const n = lerNumero(m[1]);
      if (!n) continue;
      const ficha = im[campo];
      if (ficha === null || ficha === undefined) erros.push(`O texto fala em "${m[0]}", mas a ficha não informa ${nome}: tire o número do texto.`);
      else if (n > ficha) erros.push(`O texto fala em "${m[0]}", mas a ficha tem ${ficha} ${nome}.`);
      else if (n < ficha) avisos.push(`O texto fala em "${m[0]}" e a ficha tem ${ficha} ${nome}: confira se a frase fala de uma parte deles.`);
    }
  }
  const areas = [im.area_util, im.area_total].filter((a) => Number(a) > 0).map(Number);
  for (const m of tudo.matchAll(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:\.\d+)?)\s*(?:m²|m2|metros\s+quadrados)/giu)) {
    const n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (!areas.some((a) => Math.abs(a - n) <= Math.max(1, a * 0.005))) {
      erros.push(`O texto fala em "${m[0]}", mas a ficha tem ${areas.length ? areas.map((a) => `${a} m²`).join(' e ') : 'nenhuma área'}: metragem no texto só a da ficha.`);
    }
  }
}

function avaliarPagina(p, im, { modo = 'site' } = {}) {
  const erros = [];
  const avisos = [];
  const blocos = p.blocos;
  const fotosDoImovel = new Set((im && im.fotos) || []);

  if (!im) return { aprovado: false, erros: ['O imóvel não está à venda no sistema (status "publicado" e com fotos).'], avisos, medidas: {} };
  if (p.codigo !== im.codigo) erros.push(`A página é do imóvel ${p.codigo}, não do ${im.codigo}.`);

  const paragrafos = blocos.filter((b) => b.tipo === 'paragrafo');
  const tamanhos = paragrafos.map((b) => contarPalavras(textoPuro(b.texto)));
  const secoes = blocos.filter((b) => b.tipo === 'titulo' && b.nivel === 2);
  const chamadas = blocos.filter((b) => b.tipo === 'chamada');
  const resumos = blocos.filter((b) => b.tipo === 'resumo');
  const blocosDeFoto = blocos.filter((b) => b.tipo === 'fotos');
  const palavras = palavrasDaPagina(p);
  const nPerguntas = (p.perguntas || []).length;
  const medidas = { palavras, secoes: secoes.length, fotosNoTexto: blocosDeFoto.reduce((s, b) => s + b.fotos.length, 0), galeria: p.galeria.length, fotosDoImovel: fotosDoImovel.size, perguntas: nPerguntas, chamadas: chamadas.length };

  // ---- Identidade e busca ----
  if (!slugTerminaNoCodigo(p.slug, p.codigo)) erros.push(`O endereço precisa terminar com o código do imóvel: "…-${p.codigo.toLowerCase()}".`);
  if (p.slug.length > 90) avisos.push('Endereço com mais de 90 caracteres: encurte para as palavras da busca.');
  if (p.titulo.length < 30 || p.titulo.length > 80) erros.push(`Título com ${p.titulo.length} caracteres; o intervalo é de 30 a 80.`);
  const noGoogle = (p.seo && p.seo.titulo) || p.titulo;
  if (noGoogle.length > 62) avisos.push(`Título com ${noGoogle.length} caracteres será cortado no Google; defina seo.titulo com até 60.`);
  if (p.resumo.length < 110 || p.resumo.length > 165) erros.push(`Resumo com ${p.resumo.length} caracteres; o intervalo é de 110 a 165.`);
  const tipoNoTitulo = semAcento(im.tipo || '').split(/\s+/)[0];
  if (tipoNoTitulo && !semAcento(p.titulo).includes(tipoNoTitulo)) avisos.push(`O título não diz o tipo do imóvel ("${im.tipo}"): é a primeira palavra que se busca.`);

  // ---- Tamanho e estrutura ----
  if (palavras < PALAVRAS.minimo) erros.push(`A página tem ${palavras} palavras; o mínimo é ${PALAVRAS.minimo}.`);
  if (palavras > PALAVRAS.teto) erros.push(`A página tem ${palavras} palavras; o teto é ${PALAVRAS.teto}.`);
  if (secoes.length < 2) erros.push(`A página tem ${secoes.length} seções (títulos de nível 2); o mínimo é 2.`);
  const primeiroTitulo = blocos.findIndex((b) => b.tipo === 'titulo');
  const abertura = blocos.slice(0, primeiroTitulo === -1 ? blocos.length : primeiroTitulo);
  if (!abertura.some((b) => b.tipo === 'paragrafo')) erros.push('A página abre com um parágrafo que apresenta o imóvel, antes do primeiro título.');
  if (tamanhos.length && Math.max(...tamanhos) > 110) erros.push(`Há um parágrafo com ${Math.max(...tamanhos)} palavras; quebre em dois (o teto é 110).`);
  if (resumos.length !== 1) erros.push('A página leva um (e só um) bloco "resumo" com os destaques do imóvel.');
  else if (resumos[0].itens.length < 3 || resumos[0].itens.length > 7) erros.push(`O resumo leva de 3 a 7 destaques (tem ${resumos[0].itens.length}).`);
  const vistos = new Set();
  for (const b of blocos) if (b.tipo === 'titulo') { const k = b.texto.trim().toLowerCase(); if (vistos.has(k)) erros.push(`Título repetido: ${b.texto}.`); vistos.add(k); }
  if (nPerguntas < 2 || nPerguntas > 5) erros.push(`A página leva de 2 a 5 perguntas frequentes (tem ${nPerguntas}).`);

  // ---- Chamadas ----
  if (chamadas.length === 0) erros.push('Falta ao menos uma chamada (bloco "chamada" com tema).');
  if (chamadas.length > 2) erros.push(`${chamadas.length} chamadas é panfleto; o teto é 2 (o formulário já fica ao lado do texto).`);
  const primeira = blocos.findIndex((b) => b.tipo === 'chamada');
  if (primeira !== -1 && primeira < blocos.length * 0.3) erros.push('A primeira chamada aparece cedo demais: o visitante conhece o imóvel antes do convite.');
  for (let i = 1; i < blocos.length; i += 1) if (blocos[i].tipo === 'chamada' && blocos[i - 1].tipo === 'chamada') erros.push('Duas chamadas seguidas.');

  // ---- Links: a página não manda o visitante para fora ----
  const links = blocos.flatMap((b) => textosComLink(b).flatMap(linksDoTexto));
  if (links.length) erros.push(`A página do imóvel não leva links no texto (${links.join(', ')}): o contato é o formulário e o WhatsApp da própria página.`);

  // ---- Fotos ----
  const citadas = [p.capa.foto, ...p.galeria.map((g) => g.foto), ...blocosDeFoto.flatMap((b) => b.fotos.map((f) => f.foto))];
  const naGaleria = new Set(p.galeria.map((g) => g.foto));
  if (p.capa.alt.length < 12) erros.push('A capa precisa de um texto alternativo que descreva a foto.');
  for (const g of p.galeria) {
    if (g.legenda.length < 3 || g.legenda.length > 110) erros.push(`Legenda da foto ${g.foto} com ${g.legenda.length} caracteres; o intervalo é de 3 a 110.`);
  }
  if (modo === 'publicar') {
    const fora = [...new Set(citadas.filter((f) => !fotosDoImovel.has(f)))];
    if (fora.length) erros.push(`Foto(s) que não são deste imóvel: ${fora.join(', ')}. Use só os números listados no dados.json.`);
    const semLegenda = [...fotosDoImovel].filter((f) => !naGaleria.has(f));
    if (semLegenda.length) erros.push(`A galeria precisa de TODAS as fotos do imóvel; faltam: ${semLegenda.join(', ')}.`);
    if (!naGaleria.has(p.capa.foto)) erros.push('A foto da capa precisa estar na galeria.');
    if (fotosDoImovel.size >= 6 && blocosDeFoto.length === 0) erros.push('Com 6 fotos ou mais, a página leva ao menos um bloco "fotos" no meio do texto.');
    const legendas = p.galeria.map((g) => semAcento(g.legenda));
    const repetidas = legendas.filter((l, i) => legendas.indexOf(l) !== i);
    if (repetidas.length > Math.max(2, p.galeria.length * 0.25)) avisos.push('Muitas legendas iguais na galeria: diga o que cada foto mostra de diferente.');
  } else if (!citadas.some((f) => fotosDoImovel.has(f))) {
    erros.push('Nenhuma das fotos da página existe mais no sistema.');
  }

  // ---- Honestidade ----
  const tudo = textoCorrido(p);
  const tudoComLegendas = `${tudo}\n${p.galeria.map((g) => g.legenda).join('\n')}\n${p.capa.alt}\n${p.redes ? p.redes.legenda : ''}`;
  for (const { padrao, nome } of PROIBIDOS) {
    const a = padrao.exec(tudoComLegendas);
    if (a) erros.push(`O texto traz ${nome}: "${a[0]}".`);
  }
  conferirNumeros(tudoComLegendas, im, erros, avisos);
  if (/propriet[áa]ri[oa]|dono\s+do\s+im[óo]vel|morador(?:es)?\s+atua/iu.test(tudo)) avisos.push('O texto fala do proprietário ou dos moradores: a página é sobre o imóvel, não sobre quem mora nele.');
  if (/\b(o melhor|a melhor|os melhores|as melhores|mais bonit[oa]|perfeit[oa]s?|sonho)\b/i.test(semAcento(tudo))) avisos.push('Superlativo de anúncio ("o melhor", "perfeito", "dos sonhos"): troque pelo fato que a foto ou a ficha mostram.');

  // ---- Redes ----
  if (!p.redes) erros.push('Falta o campo "redes" (legenda e hashtags para o post do imóvel).');
  else {
    if (p.redes.legenda.length < 80 || p.redes.legenda.length > 600) erros.push(`A legenda das redes tem ${p.redes.legenda.length} caracteres; o intervalo é de 80 a 600.`);
    if (p.redes.hashtags.length < 4 || p.redes.hashtags.length > 10 || p.redes.hashtags.some((h) => !/^[\p{L}\p{N}]{2,30}$/u.test(h))) erros.push('As redes levam de 4 a 10 hashtags, só letras e números, sem #.');
  }

  return { aprovado: erros.length === 0, erros: [...new Set(erros)], avisos: [...new Set(avisos)], medidas };
}

module.exports = { avaliarPagina, palavrasDaPagina, textosDoBloco };
