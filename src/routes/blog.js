// Blog RUAH · rotas públicas (sem login): /blog, /blog/<artigo>,
// /blog/categoria/<categoria>, /blog/rss.xml, /sitemap.xml e /robots.txt.
const express = require('express');
const diario = require('../blog/diario');
const paginas = require('../blog/paginas');
const { SLUGS } = require('../blog/categorias');
const { SLUG } = require('../blog/validar');

const router = express.Router();

// As capas moram no GitHub (raw.githubusercontent.com): só as páginas do blog liberam esse endereço.
const CSP_BLOG = "default-src 'self'; img-src 'self' data: https://raw.githubusercontent.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function html(res, corpo, status = 200) {
  res.status(status);
  res.setHeader('Content-Security-Policy', CSP_BLOG);
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(corpo);
}

/** "Leia também": mesma categoria e etiquetas em comum. */
function relacionados(artigo, todos) {
  return todos
    .filter((a) => a.slug !== artigo.slug)
    .map((a) => ({ a, pontos: (a.categoria === artigo.categoria ? 2 : 0) + a.etiquetas.filter((e) => artigo.etiquetas.includes(e)).length }))
    .sort((x, y) => y.pontos - x.pontos || Date.parse(y.a.publicadoEm) - Date.parse(x.a.publicadoEm))
    .slice(0, 3)
    .map((x) => x.a);
}

router.get('/robots.txt', (req, res) => res.type('text/plain').send(paginas.robots(req)));
router.get('/sitemap.xml', async (req, res) => {
  const imoveis = await require('../portal/fonte').noAr().catch(() => []);
  res.type('application/xml').send(paginas.sitemap(req, await diario.listar(), imoveis));
});
router.get('/blog/rss.xml', async (req, res) => res.type('application/rss+xml').send(paginas.rss(req, await diario.listar())));

router.get('/blog', async (req, res) => html(res, paginas.paginaInicial(req, await diario.listar())));

router.get('/blog/categoria/:cat', async (req, res, next) => {
  if (!SLUGS.has(req.params.cat)) return next();
  const lista = (await diario.listar()).filter((a) => a.categoria === req.params.cat);
  html(res, paginas.paginaInicial(req, lista, req.params.cat));
});

router.get('/blog/:slug', async (req, res, next) => {
  if (!SLUG.test(req.params.slug)) return next();
  const artigo = await diario.obter(req.params.slug);
  if (!artigo) return html(res, paginas.paginaNaoAchada(req), 404);
  html(res, paginas.paginaArtigo(req, artigo, relacionados(artigo, await diario.listar())));
});

router.get(['/blog/', '/blog/categoria'], (req, res) => res.redirect(301, '/blog'));

// ------------------------------------------------------------------ contato
// O leitor fala com a RUAH sem sair do blog: o formulário vira lead no CRM (origem "Blog RUAH").
const { one, run, audit } = require('../db');
const { txt } = require('../util');
const { normTel } = require('../services/whatsapp');

const MOTIVOS = { comprar: 'Quer comprar', vender: 'Quer vender', duvida: 'Dúvida' };
const hits = new Map();
function limite(req, max) {
  const agora = Date.now();
  const h = (hits.get(req.ip) || []).filter((t) => agora - t < 10 * 60e3);
  h.push(agora); hits.set(req.ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > max;
}

const api = express.Router();
api.post('/contato', (req, res) => {
  const b = req.body || {};
  if (b.empresa) return res.json({ ok: true }); // armadilha para robô
  if (limite(req, 6)) return res.status(429).json({ erro: 'Muitos envios seguidos. Aguarde alguns minutos.' });
  const motivo = MOTIVOS[b.motivo] ? b.motivo : 'duvida';
  const nome = txt(b.nome, 120);
  if (!nome || nome.length < 2) return res.status(400).json({ erro: 'Diga seu nome.' });
  const tel = normTel(b.telefone);
  if (!/^55\d{10,11}$/.test(tel)) return res.status(400).json({ erro: 'Confira o telefone, com DDD.' });
  const email = txt(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: 'Confira o e-mail (ou deixe em branco).' });
  if (!b.aceite) return res.status(400).json({ erro: 'Marque que concorda com o uso dos dados para o contato.' });
  const mensagem = txt(b.mensagem, 1000);
  const pagina = SLUG.test(String(b.pagina || '')) ? `/blog/${b.pagina}` : '/blog';

  const linhas = [`${MOTIVOS[motivo]} — contato pelo blog (${pagina}).`, mensagem ? `Mensagem: ${mensagem}` : '', email ? `E-mail: ${email}` : ''].filter(Boolean).join('\n');
  const existente = one('SELECT * FROM leads WHERE telefone=?', tel);
  let leadId;
  if (existente) {
    leadId = existente.id;
    run(`UPDATE leads SET ultimo_contato=datetime('now','localtime'), email=coalesce(email,?) WHERE id=?`, email, leadId);
  } else {
    leadId = Number(run(`INSERT INTO leads(nome,telefone,email,origem,etapa,temperatura,busca,ultimo_contato)
      VALUES(?,?,?,?,?,?,?,datetime('now','localtime'))`,
    nome, tel, email, 'Blog RUAH', 'novo', motivo === 'duvida' ? 'morno' : 'quente', `Veio pelo blog: ${MOTIVOS[motivo]}`).lastInsertRowid);
  }
  run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', leadId, 'blog', linhas, null);
  audit(null, 'blog_contato', `${motivo} · lead ${leadId}${existente ? ' (já existia)' : ''} · ${pagina}`);
  res.json({ ok: true });
});

module.exports = router;
module.exports.api = api;
