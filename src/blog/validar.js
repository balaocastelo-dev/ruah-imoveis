// Blog RUAH · confere o FORMATO de um artigo que chega de fora do código (um
// JSON do ramo de conteúdo). Devolve um artigo íntegro ou a lista do que está
// errado; nunca um artigo pela metade. O CONTEÚDO quem julga é a régua.
//
// Artigo = lista de blocos tipados, nunca HTML:
//   paragrafo · titulo (nivel 2|3) · resumo · lista · tabela · pros-contras · destaque · chamada

const { SLUGS, TEMAS } = require('./categorias');

const texto = (v) => typeof v === 'string' && v.trim().length > 0;
const lista = (v) => Array.isArray(v);
const objeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const numero = (v) => typeof v === 'number' && Number.isFinite(v);
const textos = (v) => lista(v) && v.length > 0 && v.every(texto);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function lerFonte(v) {
  if (!objeto(v) || !texto(v.nome) || !texto(v.url) || !/^https:\/\//.test(v.url)) return null;
  return { nome: v.nome.trim(), url: v.url.trim(), ...(texto(v.data) ? { data: v.data.trim() } : {}) };
}

function lerImagem(v) {
  if (!objeto(v) || !texto(v.src) || !texto(v.alt)) return null;
  const src = v.src.trim();
  if (!/^https:\/\//.test(src)) return null;
  return { src, alt: v.alt.trim(), ...(numero(v.largura) ? { largura: v.largura } : {}), ...(numero(v.altura) ? { altura: v.altura } : {}) };
}

function lerBloco(v, i, erros) {
  const onde = `bloco ${i + 1}`;
  if (!objeto(v) || !texto(v.tipo)) { erros.push(`${onde}: sem o campo "tipo".`); return null; }
  const falha = (m) => { erros.push(`${onde} (${String(v.tipo)}): ${m}`); return null; };
  switch (v.tipo) {
    case 'paragrafo':
      return texto(v.texto) ? { tipo: 'paragrafo', texto: v.texto } : falha('falta o texto.');
    case 'titulo':
      if (!texto(v.texto)) return falha('falta o texto.');
      if (v.nivel !== 2 && v.nivel !== 3) return falha('nivel deve ser 2 ou 3.');
      return { tipo: 'titulo', nivel: v.nivel, texto: v.texto.trim() };
    case 'lista':
      return textos(v.itens) ? { tipo: 'lista', ordenada: v.ordenada === true, itens: v.itens } : falha('itens deve ser uma lista de textos.');
    case 'resumo':
      return textos(v.itens) ? { tipo: 'resumo', itens: v.itens, ...(texto(v.titulo) ? { titulo: v.titulo } : {}) } : falha('itens deve ser uma lista de textos.');
    case 'destaque':
      if (!['dica', 'atencao', 'nota'].includes(v.tom)) return falha('tom deve ser "dica", "atencao" ou "nota".');
      return texto(v.texto) ? { tipo: 'destaque', tom: v.tom, texto: v.texto, ...(texto(v.titulo) ? { titulo: v.titulo } : {}) } : falha('falta o texto.');
    case 'tabela': {
      if (!lista(v.colunas) || v.colunas.length < 2 || !v.colunas.every((c) => typeof c === 'string')) return falha('colunas deve ter ao menos dois títulos.');
      if (!lista(v.linhas) || v.linhas.length === 0) return falha('falta a lista de linhas.');
      for (const l of v.linhas) {
        if (!lista(l) || l.length !== v.colunas.length || !l.every((c) => typeof c === 'string')) return falha('toda linha precisa ter o mesmo número de células do cabeçalho.');
      }
      const fonte = v.fonte === undefined ? undefined : lerFonte(v.fonte);
      if (fonte === null) return falha('a fonte precisa de nome e link https.');
      return {
        tipo: 'tabela', colunas: v.colunas, linhas: v.linhas,
        ...(texto(v.titulo) ? { titulo: v.titulo } : {}),
        ...(numero(v.colunaDestaque) && v.colunaDestaque > 0 && v.colunaDestaque < v.colunas.length ? { colunaDestaque: v.colunaDestaque } : {}),
        ...(fonte ? { fonte } : {}),
        ...(texto(v.nota) ? { nota: v.nota } : {}),
      };
    }
    case 'pros-contras':
      return textos(v.pros) && textos(v.contras)
        ? { tipo: 'pros-contras', pros: v.pros, contras: v.contras, ...(texto(v.titulo) ? { titulo: v.titulo } : {}) }
        : falha('pros e contras devem ser listas de textos.');
    case 'chamada':
      if (!texto(v.tema) || !TEMAS.has(v.tema)) return falha(`tema deve ser um destes: ${[...TEMAS].join(', ')}.`);
      if (v.titulo || v.texto || v.rotulo || v.href) return falha('a chamada leva só o tema: o texto já está escrito no sistema.');
      return { tipo: 'chamada', tema: v.tema };
    default:
      return falha('tipo de bloco desconhecido (use paragrafo, titulo, resumo, lista, tabela, pros-contras, destaque ou chamada).');
  }
}

/** A legenda para as redes sociais, que acompanha todo artigo. */
function lerRedes(v, erros) {
  if (!objeto(v) || !texto(v.legenda) || !textos(v.hashtags)) {
    erros.push('redes deve ter legenda (texto) e hashtags (lista de textos).');
    return null;
  }
  return { legenda: v.legenda.trim(), hashtags: v.hashtags.map((h) => h.replace(/^#/, '').trim()) };
}

function lerArtigo(bruto) {
  const erros = [];
  if (!objeto(bruto)) return { ok: false, erros: ['O arquivo não contém um artigo.'] };
  if (!texto(bruto.slug) || !SLUG.test(bruto.slug)) erros.push('slug ausente ou fora do formato (minúsculas, números e hífens).');
  if (!texto(bruto.titulo)) erros.push('falta o titulo.');
  if (!texto(bruto.resumo)) erros.push('falta o resumo.');
  if (!texto(bruto.categoria) || !SLUGS.has(bruto.categoria)) erros.push(`categoria deve ser uma destas: ${[...SLUGS].join(', ')}.`);
  if (!texto(bruto.publicadoEm) || !Number.isFinite(Date.parse(bruto.publicadoEm))) erros.push('publicadoEm deve ser uma data ISO.');
  if (bruto.etiquetas !== undefined && !(lista(bruto.etiquetas) && bruto.etiquetas.every(texto))) erros.push('etiquetas deve ser uma lista de textos.');
  if (!lista(bruto.blocos) || bruto.blocos.length === 0) erros.push('falta a lista de blocos.');

  const blocos = [];
  if (lista(bruto.blocos)) bruto.blocos.forEach((b, i) => { const l = lerBloco(b, i, erros); if (l) blocos.push(l); });

  const capa = bruto.capa === undefined || bruto.capa === null ? null : lerImagem(bruto.capa);
  if (bruto.capa && !capa) erros.push('capa precisa de src (https) e alt.');

  const perguntas = [];
  if (bruto.perguntas !== undefined) {
    if (!lista(bruto.perguntas)) erros.push('perguntas deve ser uma lista.');
    else for (const p of bruto.perguntas) {
      if (objeto(p) && texto(p.pergunta) && texto(p.resposta)) perguntas.push({ pergunta: p.pergunta.trim(), resposta: p.resposta.trim() });
      else erros.push('cada pergunta precisa de pergunta e resposta.');
    }
  }
  const fontes = [];
  if (bruto.fontes !== undefined) {
    if (!lista(bruto.fontes)) erros.push('fontes deve ser uma lista.');
    else for (const f of bruto.fontes) { const l = lerFonte(f); if (l) fontes.push(l); else erros.push('cada fonte precisa de nome e link https.'); }
  }
  if (bruto.formato !== undefined && bruto.formato !== 'dica') erros.push('formato, quando existe, é "dica".');
  const redes = bruto.redes === undefined ? null : lerRedes(bruto.redes, erros);
  const seo = objeto(bruto.seo) && texto(bruto.seo.titulo) ? { titulo: bruto.seo.titulo.trim() } : undefined;

  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      slug: bruto.slug,
      titulo: bruto.titulo.trim(),
      resumo: bruto.resumo.trim(),
      categoria: bruto.categoria,
      etiquetas: (bruto.etiquetas || []).map((e) => e.trim()),
      capa,
      publicadoEm: new Date(bruto.publicadoEm).toISOString(),
      ...(texto(bruto.atualizadoEm) && Number.isFinite(Date.parse(bruto.atualizadoEm)) ? { atualizadoEm: new Date(bruto.atualizadoEm).toISOString() } : {}),
      autor: { nome: 'Equipe RUAH' },
      origem: 'diario',
      ...(bruto.formato === 'dica' ? { formato: 'dica' } : {}),
      ...(redes ? { redes } : {}),
      ...(seo ? { seo } : {}),
      blocos,
      ...(perguntas.length ? { perguntas } : {}),
      ...(fontes.length ? { fontes } : {}),
    },
  };
}

/** Uma linha do índice: o que os cartões precisam. */
function lerResumo(b) {
  if (!objeto(b) || !texto(b.slug) || !SLUG.test(b.slug) || !texto(b.titulo) || !texto(b.resumo)) return null;
  if (!texto(b.categoria) || !SLUGS.has(b.categoria)) return null;
  if (!texto(b.publicadoEm) || !Number.isFinite(Date.parse(b.publicadoEm))) return null;
  return {
    slug: b.slug, titulo: b.titulo.trim(), resumo: b.resumo.trim(), categoria: b.categoria,
    etiquetas: lista(b.etiquetas) ? b.etiquetas.filter(texto) : [],
    capa: b.capa ? lerImagem(b.capa) : null,
    publicadoEm: new Date(b.publicadoEm).toISOString(),
    minutos: numero(b.minutos) && b.minutos > 0 ? Math.round(b.minutos) : 5,
    ...(b.formato === 'dica' ? { formato: 'dica' } : {}),
  };
}

module.exports = { lerArtigo, lerResumo, SLUG };
