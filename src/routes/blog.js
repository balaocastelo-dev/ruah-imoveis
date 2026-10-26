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
router.get('/sitemap.xml', async (req, res) => res.type('application/xml').send(paginas.sitemap(req, await diario.listar())));
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

module.exports = router;
