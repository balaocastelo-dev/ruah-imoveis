// Blog RUAH · a régua editorial em forma de código.
//
// Ninguém lê o artigo da rotina antes de ele ir ao ar. Por isso ele pode MENOS
// do que um texto revisado, e quem garante isso é esta régua — aplicada no
// comando de publicar E de novo pelo site, antes de mostrar.
//
// `erros` reprovam; `avisos` são recomendações.

const { CATEGORIAS, capaDaRotina } = require('./categorias');
const { contarPalavras, linksDoTexto, palavrasDoArtigo, textoPuro, textosDoBloco, textosComLink, semAcento } = require('./texto');

const PRINCIPAL = { minimoDePalavras: 1200, minimoDeSecoes: 4 };
const NOTICIA = { minimoDePalavras: 350, tetoDePalavras: 750, minimoDeSecoes: 2 };
const DICA = { minimoDePalavras: 450, tetoDePalavras: 950, minimoDeSecoes: 2 };

/**
 * Condição comercial e promessa não entram: o texto fica no ar por anos, e um
 * número velho ou uma promessa de valorização vira compromisso que a RUAH não
 * fez. Valores em reais só em notícia (índice de preço, teto de financiamento),
 * sempre com fonte.
 */
const L = '\\p{L}*';
const COMERCIAL = [
  { padrao: new RegExp(`sem juros|\\b\\d{1,2}\\s?x\\s+no\\s+cart|parcel${L}\\s+em\\s+(?:até\\s+)?\\d`, 'iu'), nome: 'parcelamento' },
  { padrao: /\d\s?%\s+(?:de\s+desconto|off|à\s+vista)|desconto\s+de\s+\d/iu, nome: 'percentual de desconto' },
  { padrao: new RegExp(`valoriza${L}\\s+garantid${L}|retorno\\s+garantid${L}|lucro\\s+garantid${L}|sem\\s+risco|investimento\\s+(?:100%\\s+)?seguro|garantimos|n[ãa]o\\s+tem\\s+como\\s+perder`, 'iu'), nome: 'promessa de ganho ou de segurança' },
];
const PRECO = /R\$\s?\d/;

/** Para onde um artigo da rotina pode mandar o leitor dentro do site. */
function linkInternoPermitido(link) {
  const c = link.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (c === '/blog') return true;
  const cat = /^\/blog\/categoria\/([a-z0-9-]+)$/.exec(c);
  if (cat) return CATEGORIAS.some((x) => x.slug === cat[1]);
  return /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c);
}

function tipoDe(artigo) {
  if (artigo.categoria === 'noticias') return 'noticia';
  if (artigo.formato === 'dica') return 'dica';
  return 'principal';
}

function avaliarArtigo(artigo) {
  const erros = [];
  const avisos = [];
  const tipo = tipoDe(artigo);
  const blocos = artigo.blocos;

  const paragrafos = blocos.filter((b) => b.tipo === 'paragrafo');
  const tamanhos = paragrafos.map((p) => contarPalavras(textoPuro(p.texto)));
  const secoes = blocos.filter((b) => b.tipo === 'titulo' && b.nivel === 2);
  const chamadas = blocos.filter((b) => b.tipo === 'chamada');
  const tabelas = blocos.filter((b) => b.tipo === 'tabela');
  const prosContras = blocos.filter((b) => b.tipo === 'pros-contras');
  const listas = blocos.filter((b) => b.tipo === 'lista');
  const resumos = blocos.filter((b) => b.tipo === 'resumo');
  const links = blocos.flatMap((b) => textosComLink(b).flatMap(linksDoTexto));
  const internos = links.filter((l) => l.startsWith('/'));
  const palavras = palavrasDoArtigo(artigo);
  const nPerguntas = (artigo.perguntas || []).length;
  const nFontes = (artigo.fontes || []).length;

  const medidas = {
    palavras, secoes: secoes.length, paragrafos: paragrafos.length,
    mediaPorParagrafo: tamanhos.length ? Math.round(tamanhos.reduce((a, b) => a + b, 0) / tamanhos.length) : 0,
    maiorParagrafo: tamanhos.length ? Math.max(...tamanhos) : 0,
    linksInternos: internos.length, chamadas: chamadas.length, tabelas: tabelas.length, perguntas: nPerguntas, fontes: nFontes,
  };

  // ---- Identidade e busca ----
  if (artigo.slug.length > 75) avisos.push('Endereço com mais de 75 caracteres: encurte para as palavras da busca.');
  if (artigo.titulo.length < 30 || artigo.titulo.length > 80) erros.push(`Título com ${artigo.titulo.length} caracteres; o intervalo é de 30 a 80.`);
  const tituloNoGoogle = (artigo.seo && artigo.seo.titulo) || artigo.titulo;
  if (tituloNoGoogle.length > 62) avisos.push(`Título com ${tituloNoGoogle.length} caracteres será cortado no Google; defina seo.titulo com até 60.`);
  if (artigo.resumo.length < 110 || artigo.resumo.length > 165) erros.push(`Resumo com ${artigo.resumo.length} caracteres; o intervalo é de 110 a 165.`);
  if (artigo.capa && artigo.capa.alt.trim().length < 12) erros.push('A capa precisa de um texto alternativo que descreva a imagem.');
  if (artigo.capa && !capaDaRotina(artigo.capa.src, artigo.slug)) erros.push('A capa é o arquivo gravado pelo comando de publicar: imagem de outro endereço não entra.');
  const etq = artigo.etiquetas || [];
  if (etq.length < 2 || etq.length > 6) avisos.push('Use de 2 a 6 etiquetas.');

  // ---- Tamanho e estrutura por tipo ----
  const regra = tipo === 'noticia' ? NOTICIA : tipo === 'dica' ? DICA : PRINCIPAL;
  const nome = { principal: 'artigo principal', noticia: 'notícia', dica: 'dica' }[tipo];
  if (palavras < regra.minimoDePalavras) erros.push(`${nome} com ${palavras} palavras; o mínimo é ${regra.minimoDePalavras}.`);
  if (regra.tetoDePalavras && palavras > regra.tetoDePalavras) erros.push(`${nome} com ${palavras} palavras; o teto é ${regra.tetoDePalavras}.`);
  if (secoes.length < regra.minimoDeSecoes) erros.push(`${nome} com ${secoes.length} seções (títulos de nível 2); o mínimo é ${regra.minimoDeSecoes}.`);

  const primeiroTitulo = blocos.findIndex((b) => b.tipo === 'titulo');
  const abertura = blocos.slice(0, primeiroTitulo === -1 ? blocos.length : primeiroTitulo);
  if (!abertura.some((b) => b.tipo === 'paragrafo')) erros.push('O artigo abre com um parágrafo que já responde à busca, antes do primeiro título.');
  if (medidas.maiorParagrafo > 110) erros.push(`Há um parágrafo com ${medidas.maiorParagrafo} palavras; quebre em dois (o teto é 110).`);
  if (medidas.mediaPorParagrafo > 70) avisos.push(`Parágrafos com ${medidas.mediaPorParagrafo} palavras em média; a referência é perto de 50.`);

  const vistos = new Set();
  for (const b of blocos) {
    if (b.tipo !== 'titulo') continue;
    const k = b.texto.trim().toLowerCase();
    if (vistos.has(k)) erros.push(`Título repetido: ${b.texto}.`);
    vistos.add(k);
  }

  if (tipo === 'principal') {
    if (resumos.length === 0) erros.push('Falta o bloco "resumo" (Em resumo) logo depois da abertura.');
    if (tabelas.length + prosContras.length < 2) erros.push('O artigo principal leva ao menos dois elementos entre tabela e prós e contras.');
    if (nPerguntas < 3 || nPerguntas > 6) erros.push(`O artigo principal leva de 3 a 6 perguntas frequentes (tem ${nPerguntas}).`);
  } else if (tipo === 'dica') {
    if (resumos.length === 0) erros.push('Falta o bloco "resumo" (Em resumo) logo depois da abertura.');
    if (tabelas.length + prosContras.length + listas.length < 1) erros.push('A dica precisa de uma lista de passos, tabela ou prós e contras.');
    if (nPerguntas < 2 || nPerguntas > 3) erros.push(`A dica leva 2 ou 3 perguntas frequentes (tem ${nPerguntas}).`);
  } else {
    const muda = secoes.some((s) => /muda para voc[eê]/i.test(s.texto));
    if (!muda) erros.push('A notícia precisa da seção "O que isso muda para você".');
  }

  // ---- Redes sociais: todo artigo leva a legenda que leva o curioso ao blog ----
  if (!artigo.redes) erros.push('Falta o campo "redes" (legenda e hashtags para Instagram e Facebook).');
  else {
    const r = artigo.redes;
    if (r.legenda.length < 80 || r.legenda.length > 600) erros.push(`A legenda das redes tem ${r.legenda.length} caracteres; o intervalo é de 80 a 600.`);
    if (/https?:|www\./i.test(r.legenda)) erros.push('A legenda das redes não leva endereço (o link vai na bio ou no story).');
    if (r.hashtags.length < 4 || r.hashtags.length > 10 || r.hashtags.some((h) => !/^[\p{L}\p{N}]{2,30}$/u.test(h))) {
      erros.push('As redes levam de 4 a 10 hashtags, só letras e números, sem #.');
    }
  }

  // ---- Links ----
  if (internos.length < 2) erros.push(`Só ${internos.length} link(s) para dentro do blog; inclua ao menos 2, dentro do texto.`);
  const proibidos = [...new Set(internos.filter((l) => !linkInternoPermitido(l)))];
  if (proibidos.length) erros.push(`Link interno fora da lista permitida: ${proibidos.join(', ')}.`);

  // ---- Chamadas: poucas e no lugar certo ----
  if (chamadas.length === 0) erros.push('Falta ao menos uma chamada (bloco "chamada" com tema).');
  if (chamadas.length > 3) erros.push(`${chamadas.length} chamadas é panfleto; o teto é 3.`);
  const primeira = blocos.findIndex((b) => b.tipo === 'chamada');
  if (primeira !== -1 && primeira < blocos.length * 0.25) erros.push('A primeira chamada aparece cedo demais: o leitor recebe conteúdo antes do convite.');
  for (let i = 1; i < blocos.length; i += 1) if (blocos[i].tipo === 'chamada' && blocos[i - 1].tipo === 'chamada') erros.push('Duas chamadas seguidas.');

  // ---- Honestidade ----
  const tudo = [artigo.titulo, artigo.resumo, ...blocos.flatMap(textosDoBloco), ...(artigo.perguntas || []).flatMap((p) => [p.pergunta, p.resposta])].join('\n');
  for (const { padrao, nome: n } of COMERCIAL) {
    const a = padrao.exec(tudo);
    if (a) erros.push(`O texto traz ${n} ("${a[0]}"): isso não entra em artigo.`);
  }
  if (tipo !== 'noticia') {
    const p = PRECO.exec(tudo);
    if (p) erros.push(`O texto traz valor em reais ("${p[0]}"): fora da notícia, use faixas e proporções, sem preço.`);
  }
  if (nFontes < 2) erros.push('O artigo precisa de ao menos duas fontes consultadas (campo fontes).');
  if (/(?<![\p{L}])(testamos|medimos|visitamos|em nossos testes|nossa equipe avaliou|nossos clientes)(?![\p{L}])/iu.test(tudo)) {
    erros.push('O texto afirma experiência própria da RUAH; a rotina não testou nem visitou nada — atribua o dado à fonte.');
  }
  if (/\b(a ruah|da ruah|na ruah)\b/i.test(semAcento(blocos.filter((b) => b.tipo !== 'chamada').slice(0, Math.ceil(blocos.length * 0.6)).flatMap(textosDoBloco).join(' ')))) {
    avisos.push('A RUAH aparece cedo no texto; ela entra só no fim e nas chamadas.');
  }
  for (const t of tabelas) if (t.linhas.some((l) => l.length !== t.colunas.length)) erros.push('Tabela com linha de tamanho diferente do cabeçalho.');

  return { aprovado: erros.length === 0, erros: [...new Set(erros)], avisos, medidas, tipo };
}

module.exports = { avaliarArtigo, tipoDe, linkInternoPermitido };
