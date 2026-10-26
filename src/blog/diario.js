// Blog RUAH · lê os artigos do ramo de conteúdo no GitHub.
//
// Publicar um artigo não reinstala o sistema: é um arquivo novo no ramo
// `claude/blog-conteudo`. O sistema olha o ramo a cada 10 minutos (cache), e
// guarda a última cópia boa em data/blog-cache: se a internet cair, o blog
// continua no ar com o que já tinha.
//
// Nada chega aceito de olhos fechados: formato (validar.js) e régua
// (regua.js) de novo. E o artigo só aparece se TEM FOTO e se a hora chegou.

const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { ENDERECO_DO_RAMO } = require('./categorias');
const { lerArtigo, lerResumo, SLUG } = require('./validar');
const { avaliarArtigo } = require('./regua');

const INTERVALO_MS = 10 * 60 * 1000;
const PASTA = path.join(cfg.DATA_DIR, 'blog-cache');
const base = () => (process.env.BLOG_DIARIO_URL || ENDERECO_DO_RAMO).replace(/\/+$/, '');
const ligado = () => process.env.BLOG_DIARIO !== 'false';

const memoria = new Map(); // caminho -> { quando, valor }

function arquivoDeCache(caminho) {
  return path.join(PASTA, caminho.replace(/[^a-z0-9.-]+/gi, '_'));
}

/** Busca no GitHub com cache; devolve null se não existe (404). Sem rede, usa a última cópia. */
async function buscar(caminho) {
  const m = memoria.get(caminho);
  if (m && Date.now() - m.quando < INTERVALO_MS) return m.valor;
  try {
    const r = await fetch(`${base()}/${caminho}?t=${Math.floor(Date.now() / INTERVALO_MS)}`, { signal: AbortSignal.timeout(6000) });
    if (r.status === 404) { memoria.set(caminho, { quando: Date.now(), valor: null }); return null; }
    if (!r.ok) throw new Error(`o GitHub respondeu ${r.status}`);
    const valor = await r.json();
    memoria.set(caminho, { quando: Date.now(), valor });
    try { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(arquivoDeCache(caminho), JSON.stringify(valor)); } catch { /* cache é conveniência */ }
    return valor;
  } catch (erro) {
    if (m) { memoria.set(caminho, { quando: Date.now() - INTERVALO_MS + 60_000, valor: m.valor }); return m.valor; }
    try {
      const valor = JSON.parse(fs.readFileSync(arquivoDeCache(caminho), 'utf8'));
      memoria.set(caminho, { quando: Date.now() - INTERVALO_MS + 60_000, valor });
      return valor;
    } catch { /* sem cópia */ }
    console.error(new Date().toLocaleString('pt-BR'), `[blog] não consegui ler ${caminho}: ${erro.message}`);
    throw erro;
  }
}

/** No ar = tem foto de capa E a hora marcada já chegou. */
const noAr = (a, agora = Date.now()) => !!(a.capa && a.capa.src) && Date.parse(a.publicadoEm) <= agora;

/** Os artigos no ar, do mais novo para o mais antigo. */
async function listar({ todos = false } = {}) {
  if (!ligado()) return [];
  let indice;
  try { indice = await buscar('indice.json'); } catch { return []; }
  if (!indice || !Array.isArray(indice.artigos)) return [];
  const vistos = new Set();
  const lista = [];
  for (const linha of indice.artigos) {
    const r = lerResumo(linha);
    if (!r || vistos.has(r.slug)) continue;
    vistos.add(r.slug);
    if (todos || noAr(r)) lista.push(r);
  }
  return lista.sort((a, b) => Date.parse(b.publicadoEm) - Date.parse(a.publicadoEm));
}

/** O artigo inteiro, ou null (não existe, fora do ar, malformado ou reprovado). */
async function obter(slug) {
  if (!ligado() || !SLUG.test(slug)) return null;
  const lista = await listar();
  if (!lista.some((a) => a.slug === slug)) return null; // slug inventado não gera pedido ao GitHub
  let bruto;
  try { bruto = await buscar(`artigos/${slug}.json`); } catch { return null; }
  if (!bruto) return null;
  const lido = lerArtigo(bruto);
  if (!lido.ok) { console.error(`[blog] "${slug}" fora do ar — arquivo malformado:\n- ${lido.erros.join('\n- ')}`); return null; }
  if (lido.valor.slug !== slug || !noAr(lido.valor)) return null;
  const av = avaliarArtigo(lido.valor);
  if (!av.aprovado) { console.error(`[blog] "${slug}" fora do ar — reprovado na régua:\n- ${av.erros.join('\n- ')}`); return null; }
  return lido.valor;
}

/** Para a tela do sistema: tudo, inclusive agendados e esperando foto. */
async function situacao() {
  const todos = await listar({ todos: true });
  let fila = [];
  try { const p = await buscar('capas/pendentes.json'); fila = (p && Array.isArray(p.pendentes)) ? p.pendentes : []; } catch { /* sem fila */ }
  return { artigos: todos.map((a) => ({ ...a, noAr: noAr(a), esperandoFoto: !(a.capa && a.capa.src) })), fotosNaFila: fila.length };
}

/** A legenda das redes de um artigo (no ar, agendado ou esperando foto): para a tela do sistema. */
async function redes(slug) {
  if (!SLUG.test(slug)) return null;
  const todos = await listar({ todos: true });
  if (!todos.some((a) => a.slug === slug)) return null;
  const bruto = await buscar(`artigos/${slug}.json`).catch(() => null);
  if (!bruto || !bruto.redes || typeof bruto.redes.legenda !== 'string') return null;
  const tags = Array.isArray(bruto.redes.hashtags) ? bruto.redes.hashtags.map((h) => `#${String(h).replace(/^#/, '')}`).join(' ') : '';
  return { legenda: bruto.redes.legenda, hashtags: tags };
}

function limparCache() { memoria.clear(); }

module.exports = { listar, obter, situacao, redes, noAr, limparCache };
