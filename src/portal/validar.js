// Portal RUAH · confere o FORMATO de uma página de imóvel que chega de fora do
// código (um JSON do ramo de conteúdo). Devolve uma página íntegra ou a lista do
// que está errado; nunca uma página pela metade. O CONTEÚDO quem julga é a régua.
//
// Página = lista de blocos tipados, nunca HTML:
//   paragrafo · titulo (nivel 2|3) · resumo · lista · destaque · fotos · chamada
// e uma galeria com TODAS as fotos do imóvel, cada uma com legenda e ambiente.

const { AMBIENTES, TEMAS, SLUG, CODIGO } = require('./config');

const texto = (v) => typeof v === 'string' && v.trim().length > 0;
const lista = (v) => Array.isArray(v);
const objeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const idFoto = (v) => Number.isInteger(v) && v > 0;
const textos = (v) => lista(v) && v.length > 0 && v.every(texto);

function lerBloco(v, i, erros) {
  const onde = `bloco ${i + 1}`;
  if (!objeto(v) || !texto(v.tipo)) { erros.push(`${onde}: sem o campo "tipo".`); return null; }
  const falha = (m) => { erros.push(`${onde} (${String(v.tipo)}): ${m}`); return null; };
  switch (v.tipo) {
    case 'paragrafo':
      return texto(v.texto) ? { tipo: 'paragrafo', texto: v.texto.trim() } : falha('falta o texto.');
    case 'titulo':
      if (!texto(v.texto)) return falha('falta o texto.');
      if (v.nivel !== 2 && v.nivel !== 3) return falha('nivel deve ser 2 ou 3.');
      return { tipo: 'titulo', nivel: v.nivel, texto: v.texto.trim() };
    case 'lista':
      return textos(v.itens) ? { tipo: 'lista', itens: v.itens.map((x) => x.trim()) } : falha('itens deve ser uma lista de textos.');
    case 'resumo':
      return textos(v.itens) ? { tipo: 'resumo', itens: v.itens.map((x) => x.trim()), ...(texto(v.titulo) ? { titulo: v.titulo.trim() } : {}) } : falha('itens deve ser uma lista de textos.');
    case 'destaque':
      if (!['dica', 'nota'].includes(v.tom)) return falha('tom deve ser "dica" ou "nota".');
      return texto(v.texto) ? { tipo: 'destaque', tom: v.tom, texto: v.texto.trim(), ...(texto(v.titulo) ? { titulo: v.titulo.trim() } : {}) } : falha('falta o texto.');
    case 'fotos': {
      if (!lista(v.fotos) || v.fotos.length < 1 || v.fotos.length > 3) return falha('fotos deve ter de 1 a 3 fotos.');
      const fotos = [];
      for (const f of v.fotos) {
        if (!objeto(f) || !idFoto(f.foto) || !texto(f.legenda)) return falha('cada foto precisa de "foto" (o número da foto) e "legenda".');
        fotos.push({ foto: f.foto, legenda: f.legenda.trim() });
      }
      return { tipo: 'fotos', fotos };
    }
    case 'chamada':
      if (!texto(v.tema) || !TEMAS.has(v.tema)) return falha(`tema deve ser um destes: ${[...TEMAS].join(', ')}.`);
      if (v.titulo || v.texto || v.rotulo || v.href) return falha('a chamada leva só o tema: o texto já está escrito no sistema.');
      return { tipo: 'chamada', tema: v.tema };
    default:
      return falha('tipo de bloco desconhecido (use paragrafo, titulo, resumo, lista, destaque, fotos ou chamada).');
  }
}

function lerPagina(bruto) {
  const erros = [];
  if (!objeto(bruto)) return { ok: false, erros: ['O arquivo não contém uma página.'] };
  if (!texto(bruto.codigo) || !CODIGO.test(bruto.codigo)) erros.push('codigo ausente ou fora do formato (o código do imóvel no sistema, ex.: AP0029).');
  if (!texto(bruto.slug) || !SLUG.test(bruto.slug)) erros.push('slug ausente ou fora do formato (minúsculas, números e hífens).');
  if (!texto(bruto.titulo)) erros.push('falta o titulo.');
  if (!texto(bruto.resumo)) erros.push('falta o resumo.');
  if (!lista(bruto.blocos) || bruto.blocos.length === 0) erros.push('falta a lista de blocos.');

  const blocos = [];
  if (lista(bruto.blocos)) bruto.blocos.forEach((b, i) => { const l = lerBloco(b, i, erros); if (l) blocos.push(l); });

  let capa = null;
  if (!objeto(bruto.capa) || !idFoto(bruto.capa.foto) || !texto(bruto.capa.alt)) erros.push('capa precisa de "foto" (o número da foto escolhida) e "alt" (o que ela mostra).');
  else capa = { foto: bruto.capa.foto, alt: bruto.capa.alt.trim() };

  const galeria = [];
  if (!lista(bruto.galeria) || bruto.galeria.length === 0) erros.push('falta a galeria (todas as fotos, cada uma com legenda e ambiente).');
  else {
    const vistas = new Set();
    bruto.galeria.forEach((g, i) => {
      if (!objeto(g) || !idFoto(g.foto) || !texto(g.legenda) || !texto(g.ambiente)) { erros.push(`galeria, item ${i + 1}: precisa de foto, legenda e ambiente.`); return; }
      if (!AMBIENTES[g.ambiente]) { erros.push(`galeria, item ${i + 1}: ambiente deve ser um destes: ${Object.keys(AMBIENTES).join(', ')}.`); return; }
      if (vistas.has(g.foto)) { erros.push(`galeria: a foto ${g.foto} aparece duas vezes.`); return; }
      vistas.add(g.foto);
      galeria.push({ foto: g.foto, legenda: g.legenda.trim(), ambiente: g.ambiente });
    });
  }

  const perguntas = [];
  if (bruto.perguntas !== undefined) {
    if (!lista(bruto.perguntas)) erros.push('perguntas deve ser uma lista.');
    else for (const p of bruto.perguntas) {
      if (objeto(p) && texto(p.pergunta) && texto(p.resposta)) perguntas.push({ pergunta: p.pergunta.trim(), resposta: p.resposta.trim() });
      else erros.push('cada pergunta precisa de pergunta e resposta.');
    }
  }
  let redes = null;
  if (bruto.redes !== undefined) {
    if (!objeto(bruto.redes) || !texto(bruto.redes.legenda) || !textos(bruto.redes.hashtags)) erros.push('redes deve ter legenda (texto) e hashtags (lista de textos).');
    else redes = { legenda: bruto.redes.legenda.trim(), hashtags: bruto.redes.hashtags.map((h) => h.replace(/^#/, '').trim()) };
  }
  const seo = objeto(bruto.seo) && texto(bruto.seo.titulo) ? { titulo: bruto.seo.titulo.trim() } : undefined;
  const data = (v) => texto(v) && Number.isFinite(Date.parse(v));

  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    valor: {
      codigo: bruto.codigo.trim(),
      slug: bruto.slug,
      titulo: bruto.titulo.trim(),
      resumo: bruto.resumo.trim(),
      capa,
      blocos,
      galeria,
      ...(perguntas.length ? { perguntas } : {}),
      ...(redes ? { redes } : {}),
      ...(seo ? { seo } : {}),
      ...(texto(bruto.versao) ? { versao: bruto.versao.trim() } : {}),
      ...(data(bruto.publicadoEm) ? { publicadoEm: new Date(bruto.publicadoEm).toISOString() } : {}),
      ...(data(bruto.atualizadoEm) ? { atualizadoEm: new Date(bruto.atualizadoEm).toISOString() } : {}),
    },
  };
}

/** Uma linha do índice: o que a vitrine precisa. */
function lerLinha(b) {
  if (!objeto(b) || !texto(b.codigo) || !CODIGO.test(b.codigo) || !texto(b.slug) || !SLUG.test(b.slug) || !texto(b.titulo) || !texto(b.resumo)) return null;
  if (!objeto(b.capa) || !idFoto(b.capa.foto) || !texto(b.capa.alt)) return null;
  return {
    codigo: b.codigo, slug: b.slug, titulo: b.titulo.trim(), resumo: b.resumo.trim(),
    capa: { foto: b.capa.foto, alt: b.capa.alt.trim() },
    versao: texto(b.versao) ? b.versao : '',
    publicadoEm: texto(b.publicadoEm) && Number.isFinite(Date.parse(b.publicadoEm)) ? new Date(b.publicadoEm).toISOString() : null,
    atualizadoEm: texto(b.atualizadoEm) && Number.isFinite(Date.parse(b.atualizadoEm)) ? new Date(b.atualizadoEm).toISOString() : null,
  };
}

module.exports = { lerPagina, lerLinha };
