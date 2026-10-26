// Portal RUAH · rotas públicas (sem login).
//   /imoveis                    vitrine com busca e filtros
//   /imoveis/favoritos          favoritos do visitante (guardados no aparelho)
//   /imoveis/<endereço>         a página única do imóvel  (/imoveis/AP0029 leva até ela)
//   /imoveis/foto/<id>          foto de imóvel à venda
//   /imoveis/dados.json         a ficha e as fotos de cada imóvel à venda, para a rotina que escreve as páginas
//   POST /api/publico/portal/interesse   "Tenho interesse" / "Agendar visita" → lead no CRM
const express = require('express');
const { one, run, audit } = require('../db');
const { txt } = require('../util');
const fonte = require('../portal/fonte');
const dados = require('../portal/dados');
const paginas = require('../portal/paginas');
const { SLUG, CODIGO } = require('../portal/config');
const { normTel } = require('../services/whatsapp');

const router = express.Router();

const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function html(res, corpo, status = 200) {
  res.status(status);
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // A Vercel guarda a página por 2 minutos; o preço e o status vêm do banco a cada renovação.
  res.setHeader('Cache-Control', status === 200 ? 'public, max-age=60, s-maxage=120, stale-while-revalidate=600' : 'no-store');
  res.type('html').send(corpo);
}

router.get('/imoveis', async (req, res) => html(res, paginas.paginaVitrine(req, await fonte.noAr())));
router.get('/imoveis/favoritos', async (req, res) => html(res, paginas.paginaFavoritos(req, await fonte.noAr())));

router.get('/imoveis/dados.json', async (req, res) => {
  const e = await fonte.obterEstado();
  const base = paginas.urlBase(req);
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
  res.json({
    geradoEm: new Date().toISOString(),
    imoveis: e.imoveis.map((im) => {
      const s = e.situacao.get(im.codigo) || {};
      return {
        codigo: im.codigo, versao: im.versao, tipo: im.tipo, bairro: im.bairro, cidade: im.cidade, uf: im.uf,
        condominio: im.condominio, lazer_do_condominio: im.lazer,
        quartos: im.quartos, suites: im.suites, vagas: im.vagas, area_util: im.area_util, area_total: im.area_total,
        descricao_do_anuncio: im.descricao,
        fotos: im.fotos.map((id) => ({ foto: id, url: `${base}${paginas.fotoUrl(id)}` })),
        pagina: { estado: s.estado || 'sem-pagina', ...(s.slug ? { slug: s.slug } : {}), ...(s.erros ? { erros: s.erros } : {}) },
      };
    }),
  });
});

router.get('/imoveis/foto/:id', (req, res) => {
  if (!/^\d{1,9}$/.test(req.params.id)) return res.sendStatus(404);
  const f = dados.fotoPublica(req.params.id);
  const buf = f && require('../services/conteudo').ler(f);
  if (!buf) { res.setHeader('Cache-Control', 'no-store'); return res.sendStatus(404); }
  res.setHeader('Content-Type', f.mime);
  // O número da foto nunca muda de conteúdo: pode ficar em cache por muito tempo.
  res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buf);
});

router.get('/imoveis/:slug', async (req, res, next) => {
  const s = req.params.slug;
  if (CODIGO.test(s.toUpperCase()) && !s.includes('--')) {
    const x = await fonte.porCodigo(s.toUpperCase());
    if (x) return res.redirect(301, `/imoveis/${x.pagina.slug}`);
  }
  if (!SLUG.test(s)) return next();
  const x = await fonte.porSlug(s);
  if (!x) return html(res, paginas.paginaNaoAchada(req), 404);
  html(res, paginas.paginaImovel(req, x, await fonte.noAr()));
});
router.get('/imoveis/', (req, res) => res.redirect(301, '/imoveis'));

// ------------------------------------------------------------------ contato
const hits = new Map();
function limite(req, max) {
  const agora = Date.now();
  const h = (hits.get(req.ip) || []).filter((t) => agora - t < 10 * 60e3);
  h.push(agora); hits.set(req.ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > max;
}

const api = express.Router();
api.post('/interesse', async (req, res) => {
  const b = req.body || {};
  if (b.empresa) return res.json({ ok: true }); // armadilha para robô: finge que deu certo
  if (limite(req, 6)) return res.status(429).json({ erro: 'Muitos envios seguidos. Aguarde alguns minutos ou fale pelo WhatsApp.' });
  const codigo = String(b.codigo || '').toUpperCase();
  if (!CODIGO.test(codigo)) return res.status(400).json({ erro: 'Imóvel inválido.' });
  const im = dados.imovelAVenda(codigo);
  if (!im) return res.status(404).json({ erro: 'Este imóvel não está mais à venda.' });
  const nome = txt(b.nome, 120);
  if (!nome || nome.length < 2) return res.status(400).json({ erro: 'Diga seu nome.' });
  const tel = normTel(b.telefone);
  if (!/^55\d{10,11}$/.test(tel)) return res.status(400).json({ erro: 'Confira o telefone, com DDD.' });
  const email = txt(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: 'Confira o e-mail (ou deixe em branco).' });
  if (!b.aceite) return res.status(400).json({ erro: 'Marque que concorda com o uso dos dados para o contato.' });
  const mensagem = txt(b.mensagem, 1000);
  const visita = !!b.visita;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dia || '')) ? String(b.dia).split('-').reverse().join('/') : null;
  const periodo = ['Manhã', 'Tarde', 'Fim de semana'].includes(b.periodo) ? b.periodo : null;

  const x = await fonte.porCodigo(codigo);
  const linhas = [
    `${visita ? 'Pediu VISITA' : 'Interesse'} pelo portal no imóvel ${im.codigo} (${im.tipo}, ${[im.bairro, im.cidade].filter(Boolean).join(', ')})${x ? ` — /imoveis/${x.pagina.slug}` : ''}.`,
    visita ? `Preferência: ${[dia, periodo].filter(Boolean).join(', ') || 'qualquer dia'}.` : '',
    mensagem ? `Mensagem: ${mensagem}` : '',
    email ? `E-mail: ${email}` : '',
  ].filter(Boolean).join('\n');

  const existente = one('SELECT * FROM leads WHERE telefone=?', tel);
  let leadId;
  if (existente) {
    leadId = existente.id;
    run(`UPDATE leads SET ultimo_contato=datetime('now','localtime'), temperatura='quente', email=coalesce(email,?) WHERE id=?`, email, leadId);
  } else {
    leadId = Number(run(`INSERT INTO leads(nome,telefone,email,origem,etapa,temperatura,corretor_id,tipo_desejado,bairros,busca,ultimo_contato)
      VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
    nome, tel, email, 'Portal RUAH', visita ? 'visita' : 'novo', 'quente', one('SELECT corretor_id FROM imoveis WHERE id=?', im.id).corretor_id || null,
    im.tipo, im.bairro, `Veio pelo portal: ${im.codigo}`).lastInsertRowid);
  }
  run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', leadId, 'portal', linhas, null);
  audit(null, 'portal_interesse', `${im.codigo} · lead ${leadId}${existente ? ' (já existia)' : ''}${visita ? ' · visita' : ''}`);
  res.json({ ok: true });
});

module.exports = router;
module.exports.api = api;
