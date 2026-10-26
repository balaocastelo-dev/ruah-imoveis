// Teste do blog: monta um ramo de conteúdo falso num servidor local, aponta o
// sistema para ele e confere as páginas públicas, a régua e as regras de "no ar".
//   node test/blog.js [artigo.json]
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-blog-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';

const { ENDERECO_DO_RAMO } = require('../src/blog/categorias');
const { lerArtigo } = require('../src/blog/validar');
const { avaliarArtigo } = require('../src/blog/regua');

const modelo = process.argv[2] || path.join(__dirname, 'blog-exemplo.json');
const base = JSON.parse(fs.readFileSync(modelo, 'utf8'));
const capa = (slug) => ({ src: `${ENDERECO_DO_RAMO}/capas/${slug}-0123abcd.jpg`, alt: base.capa?.alt || 'Sala clara com plantas e janela grande', largura: 1600, altura: 900 });
const agora = Date.now();
const artigos = {
  [base.slug]: { ...base, capa: capa(base.slug), publicadoEm: new Date(agora - 3600e3).toISOString() },
  'artigo-sem-foto-ainda-esperando': { ...base, slug: 'artigo-sem-foto-ainda-esperando', capa: undefined, publicadoEm: new Date(agora - 3600e3).toISOString() },
  'artigo-agendado-para-amanha-cedo': { ...base, slug: 'artigo-agendado-para-amanha-cedo', capa: capa('artigo-agendado-para-amanha-cedo'), publicadoEm: new Date(agora + 86400e3).toISOString() },
};
const indice = { artigos: Object.values(artigos).map((a) => ({ slug: a.slug, titulo: a.titulo, resumo: a.resumo, categoria: a.categoria, etiquetas: a.etiquetas, capa: a.capa, publicadoEm: a.publicadoEm, minutos: 5, formato: a.formato })) };

const ramo = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  let corpo = null;
  if (p === '/indice.json') corpo = indice;
  else if (p === '/capas/pendentes.json') corpo = { pendentes: [{ slug: 'artigo-sem-foto-ainda-esperando' }] };
  else { const m = /^\/artigos\/([a-z0-9-]+)\.json$/.exec(p); if (m && artigos[m[1]]) corpo = artigos[m[1]]; }
  if (!corpo) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(corpo));
}).listen(0, async () => {
  process.env.BLOG_DIARIO_URL = `http://127.0.0.1:${ramo.address().port}`;
  const app = require('../server');
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}`;
  const get = async (p) => { const r = await fetch(url + p, { redirect: 'manual' }); return { s: r.status, t: await r.text(), h: r.headers }; };
  try {
    // régua: o modelo passa com capa; sem redes, reprova
    const lido = lerArtigo(artigos[base.slug]);
    assert.ok(lido.ok, JSON.stringify(lido.erros));
    const av = avaliarArtigo(lido.valor);
    assert.ok(av.aprovado, av.erros.join('\n')); console.log('ok · régua aprova o modelo');
    const ruim = { ...lido.valor, redes: undefined, blocos: [...lido.valor.blocos, { tipo: 'paragrafo', texto: 'Valorização garantida e parcelas em 10x no cartão.' }] };
    const av2 = avaliarArtigo(ruim);
    assert.ok(!av2.aprovado && av2.erros.some((e) => /promessa/.test(e)) && av2.erros.some((e) => /redes/.test(e))); console.log('ok · régua barra promessa e falta de legenda');

    const ini = await get('/blog');
    assert.equal(ini.s, 200); assert.ok(ini.t.includes(base.titulo.replace(/&/g, '&amp;').slice(0, 30)), 'título do artigo na inicial');
    assert.ok(!ini.t.includes('artigo-sem-foto-ainda-esperando'), 'sem foto fica fora');
    assert.ok(!ini.t.includes('artigo-agendado-para-amanha-cedo'), 'agendado fica fora');
    assert.match(ini.h.get('content-security-policy'), /raw\.githubusercontent\.com/); console.log('ok · /blog mostra só o que tem foto e já chegou a hora');

    const art = await get(`/blog/${base.slug}`);
    assert.equal(art.s, 200); assert.ok(art.t.includes('<h1>')); assert.ok(art.t.includes('application/ld+json')); assert.ok(art.t.includes('og:image'));
    console.log('ok · artigo com texto no HTML, JSON-LD e og:image');
    // O leitor não sai do site da RUAH: só links do blog, do site da RUAH e do WhatsApp da RUAH.
    for (const pag of [art.t, ini.t]) {
      const fora = [...pag.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) => m[1])
        .filter((h) => !h.startsWith('/') && !h.startsWith('#') && !/^https:\/\/(www\.)?ruahimobiliaria\.com\.br/.test(h) && !/^https:\/\/wa\.me\/55/.test(h));
      assert.deepEqual(fora, [], `link para fora: ${fora.join(', ')}`);
    }
    const { paginaArtigo } = require('../src/blog/paginas');
    const comFora = { ...lido.valor, blocos: [{ tipo: 'paragrafo', texto: 'Veja [este site](https://exemplo.com.br/x) e [este texto](/blog/outro).' }, ...lido.valor.blocos] };
    const h = paginaArtigo({ protocol: 'http', get: () => 'x', path: '/blog/x' }, comFora, []);
    assert.ok(!h.includes('exemplo.com.br/x"') && h.includes('href="/blog/outro"')); console.log('ok · nenhuma página leva para fora do site da RUAH');
    assert.ok(avaliarArtigo(comFora).erros.some((e) => /fora do site/.test(e))); console.log('ok · régua barra link para fora no texto');
    assert.equal((await get('/blog/artigo-sem-foto-ainda-esperando')).s, 404);
    assert.equal((await get('/blog/artigo-agendado-para-amanha-cedo')).s, 404);
    assert.equal((await get('/blog/nao-existe-esse')).s, 404); console.log('ok · sem foto, agendado e inventado dão 404');
    assert.equal((await get(`/blog/categoria/${base.categoria}`)).s, 200);
    assert.equal((await get('/blog/categoria/inventada')).s, 404); console.log('ok · categorias');
    const rss = await get('/blog/rss.xml'); assert.ok(rss.t.includes(`/blog/${base.slug}`));
    const sm = await get('/sitemap.xml'); assert.ok(sm.t.includes(`/blog/${base.slug}`) && !sm.t.includes('agendado'));
    const rb = await get('/robots.txt'); assert.ok(/Disallow: \//.test(rb.t) && /Allow: \/blog/.test(rb.t)); console.log('ok · RSS, sitemap e robots (sistema fora da busca)');
    assert.equal((await get('/api/blog')).s, 401); console.log('ok · /api/blog pede login');
    console.log('\nBlog OK');
    process.exit(0);
  } catch (e) { console.error('FALHOU', e.message); process.exit(1); }
});
