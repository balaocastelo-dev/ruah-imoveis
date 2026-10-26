// Blog RUAH · leitura do texto de um artigo: a marcação mínima, a contagem de
// palavras, o tempo de leitura e o sumário. Adaptado do blog da Balão
// (lib/blog/texto.ts). Fica sem dependências para servir ao site, à régua e ao
// comando de publicar.
//
// Texto corrido aceita só: **negrito**   *itálico*   [texto](/caminho ou https://...)

const PADRAO = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*/;

/** Só deixa passar endereço que um link de artigo pode ter. */
function hrefSeguro(href) {
  const h = String(href || '').trim();
  if (!h) return null;
  if (h.startsWith('/') && !h.startsWith('//')) return h;
  if (h.startsWith('#')) return h;
  if (/^https:\/\//i.test(h)) return h;
  return null;
}

/** Quebra o texto em trechos: texto, negrito, itálico, link. */
function lerTextoRico(texto) {
  const saida = [];
  let resto = String(texto ?? '');
  while (resto.length > 0) {
    const m = PADRAO.exec(resto);
    if (!m) { saida.push({ tipo: 'texto', valor: resto }); break; }
    if (m.index > 0) saida.push({ tipo: 'texto', valor: resto.slice(0, m.index) });
    if (m[1] !== undefined) {
      const href = hrefSeguro(m[2]);
      if (href) saida.push({ tipo: 'link', href, filhos: lerTextoRico(m[1]) });
      else saida.push({ tipo: 'texto', valor: m[1] });
    } else if (m[3] !== undefined) saida.push({ tipo: 'negrito', filhos: lerTextoRico(m[3]) });
    else if (m[4] !== undefined) saida.push({ tipo: 'italico', filhos: lerTextoRico(m[4]) });
    resto = resto.slice(m.index + m[0].length);
  }
  return saida;
}

const trechosParaTexto = (t) => t.map((x) => (x.tipo === 'texto' ? x.valor : trechosParaTexto(x.filhos))).join('');

function textoPuro(texto) {
  return trechosParaTexto(lerTextoRico(texto)).replace(/\s+/g, ' ').trim();
}

function linksDoTexto(texto) {
  const saida = [];
  const coletar = (trechos) => {
    for (const t of trechos) {
      if (t.tipo === 'texto') continue;
      if (t.tipo === 'link') saida.push(t.href);
      coletar(t.filhos);
    }
  };
  coletar(lerTextoRico(texto));
  return saida;
}

function semAcento(texto) {
  return String(texto || '').replace(/ /g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function criarSlug(texto) {
  const s = semAcento(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
  return s || 'secao';
}

function contarPalavras(texto) {
  return String(texto || '').split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

/** Todo o texto que o leitor lê num bloco, em linhas soltas. */
function textosDoBloco(b) {
  switch (b.tipo) {
    case 'paragrafo': return [textoPuro(b.texto)];
    case 'titulo': return [b.texto];
    case 'lista':
    case 'resumo': return b.itens.map(textoPuro);
    case 'destaque': return [b.titulo || '', textoPuro(b.texto)];
    case 'tabela': return [b.titulo || '', ...b.linhas.flat().map(textoPuro), b.nota ? textoPuro(b.nota) : ''];
    case 'pros-contras': return [...b.pros, ...b.contras];
    case 'chamada': return [];
    default: return [];
  }
}

/** Os textos de um bloco que podem ter link. */
function textosComLink(b) {
  switch (b.tipo) {
    case 'paragrafo':
    case 'destaque': return [b.texto];
    case 'lista':
    case 'resumo': return b.itens;
    case 'tabela': return [...b.linhas.flat(), b.nota || ''];
    default: return [];
  }
}

function palavrasDoArtigo(artigo) {
  let total = 0;
  for (const b of artigo.blocos) for (const l of textosDoBloco(b)) total += contarPalavras(l);
  for (const p of artigo.perguntas || []) total += contarPalavras(p.pergunta) + contarPalavras(p.resposta);
  return total;
}

/** 200 palavras por minuto; tabela conta meio minuto. */
function minutosDeLeitura(artigo) {
  const tabelas = artigo.blocos.filter((b) => b.tipo === 'tabela').length;
  return Math.max(1, Math.round(palavrasDoArtigo(artigo) / 200 + tabelas * 0.5));
}

/** Âncoras do sumário; títulos iguais ganham "-2". */
function montarSumario(blocos) {
  const usados = new Map();
  const ids = new Map();
  const sumario = [];
  for (const b of blocos) {
    if (b.tipo !== 'titulo') continue;
    const base = criarSlug(b.texto);
    const vezes = (usados.get(base) || 0) + 1;
    usados.set(base, vezes);
    const id = vezes === 1 ? base : `${base}-${vezes}`;
    ids.set(b, id);
    sumario.push({ id, texto: b.texto, nivel: b.nivel });
  }
  return { sumario, ids };
}

const FUSO = 'America/Sao_Paulo';

function dataPorExtenso(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: FUSO }).format(d);
}

function diaEmCampinas(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function cortar(texto, max) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const e = corte.lastIndexOf(' ');
  return `${(e > max * 0.6 ? corte.slice(0, e) : corte).replace(/[\s,;:.]+$/, '')}…`;
}

module.exports = {
  FUSO, hrefSeguro, lerTextoRico, textoPuro, linksDoTexto, semAcento, criarSlug, contarPalavras,
  textosDoBloco, textosComLink, palavrasDoArtigo, minutosDeLeitura, montarSumario, dataPorExtenso, diaEmCampinas, cortar,
};
