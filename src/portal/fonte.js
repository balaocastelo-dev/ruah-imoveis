// Portal RUAH · junta as páginas escritas (ramo do GitHub) com a ficha AO VIVO
// (banco) e decide o que está no ar.
//
// Publicar uma página não reinstala o sistema: é um arquivo novo no ramo
// `claude/portal-conteudo`. O sistema relê o ramo a cada 10 minutos e guarda a
// última cópia boa em data/portal-cache: se o GitHub cair, o portal continua.
//
// No ar = imóvel à venda (status "publicado", com foto) + página no ramo +
// formato certo + régua aprovada contra a ficha de agora. Faltou um, fica fora.

const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { ENDERECO_DO_RAMO } = require('./config');
const { lerPagina, lerLinha } = require('./validar');
const { avaliarPagina } = require('./regua');
const dados = require('./dados');

const INTERVALO_MS = 10 * 60 * 1000;
const ESTADO_MS = 2 * 60 * 1000;
const PASTA = path.join(cfg.DATA_DIR, 'portal-cache');
const base = () => (process.env.PORTAL_CONTEUDO_URL || ENDERECO_DO_RAMO).replace(/\/+$/, '');
const ligado = () => process.env.PORTAL !== 'false';

const memoria = new Map(); // caminho -> { quando, valor }
const arquivoDeCache = (c) => path.join(PASTA, c.replace(/[^a-z0-9.-]+/gi, '_'));

/** Busca no GitHub com cache; null se não existe. Sem rede, usa a última cópia. */
async function buscar(caminho) {
  const m = memoria.get(caminho);
  if (m && Date.now() - m.quando < INTERVALO_MS) return m.valor;
  try {
    const r = await fetch(`${base()}/${caminho}?t=${Math.floor(Date.now() / INTERVALO_MS)}`, { signal: AbortSignal.timeout(6000) });
    if (r.status === 404) { memoria.set(caminho, { quando: Date.now(), valor: null }); return null; }
    if (!r.ok) throw new Error(`o GitHub respondeu ${r.status}`);
    const valor = await r.json();
    memoria.set(caminho, { quando: Date.now(), valor });
    try { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(arquivoDeCache(caminho), JSON.stringify(valor)); } catch { /* conveniência */ }
    return valor;
  } catch (erro) {
    if (m) { memoria.set(caminho, { quando: Date.now() - INTERVALO_MS + 60_000, valor: m.valor }); return m.valor; }
    try {
      const valor = JSON.parse(fs.readFileSync(arquivoDeCache(caminho), 'utf8'));
      memoria.set(caminho, { quando: Date.now() - INTERVALO_MS + 60_000, valor });
      return valor;
    } catch { /* sem cópia */ }
    console.error(new Date().toLocaleString('pt-BR'), `[portal] não consegui ler ${caminho}: ${erro.message}`);
    throw erro;
  }
}

/** Busca várias páginas com no máximo `n` pedidos ao mesmo tempo. */
async function emLotes(itens, n, fn) {
  const saida = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; saida[k] = await fn(itens[k]).catch(() => null); }
  }));
  return saida;
}

let estado = null; // { quando, valor }
let calculando = null;

/**
 * O estado do portal:
 *   noAr:     [{ imovel, pagina }]   o que aparece, do mais novo para o mais antigo
 *   situacao: por código, para a tela do sistema e para a rotina
 */
async function calcular() {
  const imoveis = dados.imoveisAVenda();
  const situacao = new Map(imoveis.map((im) => [im.codigo, { codigo: im.codigo, tipo: im.tipo, bairro: im.bairro, cidade: im.cidade, fotos: im.fotos.length, versao: im.versao, estado: 'sem-pagina' }]));
  if (!ligado()) return { noAr: [], situacao, imoveis };

  let indice = null;
  try { indice = await buscar('indice.json'); } catch { /* sem índice: portal vazio */ }
  const linhas = (indice && Array.isArray(indice.paginas) ? indice.paginas : []).map(lerLinha).filter(Boolean);
  const porCodigo = new Map(imoveis.map((im) => [im.codigo, im]));
  const usadas = linhas.filter((l) => porCodigo.has(l.codigo));
  const brutos = await emLotes(usadas, 16, (l) => buscar(`paginas/${l.codigo}.json`));

  const noAr = [];
  const slugs = new Set();
  usadas.forEach((linha, k) => {
    const im = porCodigo.get(linha.codigo);
    const s = situacao.get(im.codigo);
    s.slug = linha.slug; s.titulo = linha.titulo; s.publicadoEm = linha.publicadoEm; s.atualizadoEm = linha.atualizadoEm;
    const bruto = brutos[k];
    if (!bruto) { s.estado = 'sem-arquivo'; return; }
    const lido = lerPagina(bruto);
    if (!lido.ok) { s.estado = 'reprovada'; s.erros = lido.erros; console.error(`[portal] ${im.codigo} fora do ar — arquivo malformado:\n- ${lido.erros.join('\n- ')}`); return; }
    const pg = lido.valor;
    if (pg.codigo !== im.codigo || pg.slug !== linha.slug || slugs.has(pg.slug)) { s.estado = 'reprovada'; s.erros = ['O arquivo não bate com o índice (código ou endereço).']; return; }
    const av = avaliarPagina(pg, dados.fichaParaRegua(im), { modo: 'site' });
    if (!av.aprovado) { s.estado = 'reprovada'; s.erros = av.erros; console.error(`[portal] ${im.codigo} fora do ar — reprovado na régua:\n- ${av.erros.join('\n- ')}`); return; }
    slugs.add(pg.slug);
    s.estado = pg.versao && pg.versao !== im.versao ? 'desatualizada' : 'no-ar';
    noAr.push({ imovel: im, pagina: pg });
  });
  noAr.sort((a, b) => Date.parse(b.pagina.publicadoEm || 0) - Date.parse(a.pagina.publicadoEm || 0) || b.imovel.id - a.imovel.id);
  return { noAr, situacao, imoveis };
}

async function obterEstado() {
  if (estado && Date.now() - estado.quando < ESTADO_MS) return estado.valor;
  if (!calculando) calculando = calcular().then((v) => { estado = { quando: Date.now(), valor: v }; return v; }).finally(() => { calculando = null; });
  return calculando;
}

const noAr = async () => (await obterEstado()).noAr;
async function porSlug(slug) { return (await noAr()).find((x) => x.pagina.slug === slug) || null; }
async function porCodigo(codigo) { return (await noAr()).find((x) => x.imovel.codigo === codigo) || null; }

/** Para a tela do sistema: todos os imóveis à venda e a situação da página de cada um. */
async function situacao() {
  const e = await obterEstado();
  return [...e.situacao.values()];
}

function limparCache() { memoria.clear(); estado = null; }

module.exports = { noAr, porSlug, porCodigo, situacao, obterEstado, limparCache };
