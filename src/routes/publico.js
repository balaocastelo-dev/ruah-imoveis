// Páginas abertas sem login: assinatura do proprietário, link interno do imóvel e webhook do WhatsApp.
const express = require('express');
const fs = require('fs');
const path = require('path');
const A = require('../auth');
const cfg = require('../config');
const { one, all, run, audit } = require('../db');
const { falha, txt, cpfValido, fmtCpf } = require('../util');
const drive = require('../services/drive');
const wa = require('../services/whatsapp');
const { pdfAutorizacao } = require('../services/pdf');

const r = express.Router();

// limite simples por IP para as rotas públicas
const hits = new Map();
function limite(max) {
  return (req, res, next) => {
    const k = req.ip + req.baseUrl + req.route.path, agora = Date.now();
    const h = (hits.get(k) || []).filter((t) => agora - t < 60e3); h.push(agora); hits.set(k, h);
    if (h.length > max) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde um minuto.' });
    next();
  };
}

// ---- assinatura ----
function assinaturaPorToken(token) {
  const a = one('SELECT a.*, i.codigo, i.proprietario_id FROM assinaturas a JOIN imoveis i ON i.id=a.imovel_id WHERE a.token=?', String(token));
  if (!a) falha(404, 'Link de assinatura inválido.');
  return a;
}
r.get('/assinatura/:token', limite(30), (req, res) => {
  const a = assinaturaPorToken(req.params.token);
  const dono = a.proprietario_id ? one('SELECT nome FROM proprietarios WHERE id=?', a.proprietario_id) : null;
  res.json({ status: a.status, conteudo: a.status === 'cancelado' ? null : a.conteudo, codigo: a.codigo, nome: dono && dono.nome, empresa: cfg.EMPRESA, assinado_em: a.assinado_em });
});
r.post('/assinatura/:token', limite(8), async (req, res) => {
  const a = assinaturaPorToken(req.params.token);
  if (a.status !== 'pendente') falha(409, a.status === 'assinado' ? 'Este documento já foi assinado.' : 'Este link foi cancelado. Peça um novo ao corretor.');
  const { nome, cpf, aceite, assinatura_png } = req.body || {};
  if (!aceite) falha(400, 'Marque que leu e concorda com o documento.');
  if (!txt(nome) || txt(nome).split(/\s+/).length < 2) falha(400, 'Informe seu nome completo.');
  if (!cpfValido(cpf)) falha(400, 'CPF inválido.');
  const dono = a.proprietario_id ? one('SELECT * FROM proprietarios WHERE id=?', a.proprietario_id) : null;
  if (dono && dono.cpf && dono.cpf.replace(/\D/g, '') !== String(cpf).replace(/\D/g, '')) falha(400, 'O CPF não confere com o proprietário cadastrado. Fale com o corretor.');
  if (typeof assinatura_png !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(assinatura_png) || assinatura_png.length > 400000 || assinatura_png.length < 500) falha(400, 'Desenhe sua assinatura no quadro.');
  if (A.sha256(a.conteudo) !== a.conteudo_hash) falha(500, 'O documento foi alterado depois de gerado. Peça um novo link.');

  const assinado_em = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (horário de Brasília)';
  const dados = { nome: txt(nome, 120), cpf: fmtCpf(cpf), ip: req.ip, ua: String(req.headers['user-agent'] || '').slice(0, 300) };
  const upd = run(`UPDATE assinaturas SET status='assinado', assinante_nome=?, assinante_cpf=?, assinatura_png=?, ip=?, user_agent=?, assinado_em=? WHERE id=? AND status='pendente'`,
    dados.nome, dados.cpf, assinatura_png, dados.ip, dados.ua, assinado_em, a.id);
  if (!upd.changes) falha(409, 'Este documento já foi assinado.');

  const pdf = await pdfAutorizacao({ ...a, assinante_nome: dados.nome, assinante_cpf: dados.cpf, assinatura_png, ip: dados.ip, user_agent: dados.ua, assinado_em, imovel_codigo: a.codigo });
  const arq = await drive.salvarArquivo({ imovelId: a.imovel_id, categoria: 'Autorização de venda', nome: `Autorizacao de venda ${a.codigo} - assinada.pdf`, mime: 'application/pdf', buffer: pdf });
  run('UPDATE assinaturas SET pdf_arquivo_id=? WHERE id=?', arq.id, a.id);
  const ate = new Date(Date.now() + a.prazo_dias * 864e5).toISOString().slice(0, 10);
  run(`UPDATE imoveis SET exclusivo=?, exclusivo_ate=?, status=CASE WHEN status IN ('captacao','aguardando_autorizacao') THEN 'off_market' ELSE status END, atualizado_em=datetime('now','localtime') WHERE id=?`,
    a.exclusivo, a.exclusivo ? ate : null, a.imovel_id);
  audit(null, 'autorizacao_assinada', `${a.codigo} · ${dados.nome} · ${dados.ip}`);
  res.json({ ok: true, assinado_em });
});

// ---- link interno (off-market) ----
function linkValido(token) {
  const k = one(`SELECT * FROM links_internos WHERE token=? AND expira_em > datetime('now','localtime')`, String(token));
  if (!k) falha(404, 'Este link expirou ou não existe. Peça um novo ao corretor.');
  return k;
}
r.get('/imovel/:token', limite(60), (req, res) => {
  const k = linkValido(req.params.token);
  const i = one(`SELECT i.*, c.nome condominio, c.lazer, u.nome corretor, u.telefone corretor_tel FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id
                 LEFT JOIN usuarios u ON u.id=i.corretor_id WHERE i.id=?`, k.imovel_id);
  if (!i || ['vendido', 'suspenso'].includes(i.status)) falha(404, 'Este imóvel não está mais disponível.');
  run('INSERT INTO links_acessos(link_id,ip,user_agent) VALUES(?,?,?)', k.id, req.ip, String(req.headers['user-agent'] || '').slice(0, 300));
  const fotos = all("SELECT id FROM arquivos WHERE imovel_id=? AND categoria='Fotos' AND mime LIKE 'image/%' ORDER BY id LIMIT 40", i.id).map((f) => f.id);
  res.json({
    empresa: cfg.EMPRESA, codigo: i.codigo, tipo: i.tipo, condominio: i.condominio, lazer: i.lazer, bairro: i.bairro, cidade: i.cidade,
    endereco: k.mostrar_endereco ? [i.logradouro, i.numero].filter(Boolean).join(', ') : null,
    quartos: i.quartos, suites: i.suites, vagas: i.vagas, area_util: i.area_util, area_total: i.area_total, valor: i.valor, valor_condominio: i.valor_condominio, iptu: i.iptu,
    descricao: i.descricao, corretor: i.corretor, corretor_tel: i.corretor_tel, fotos, expira_em: k.expira_em,
  });
});
r.get('/imovel/:token/foto/:fid', limite(300), (req, res) => {
  const k = linkValido(req.params.token);
  const f = one("SELECT * FROM arquivos WHERE id=? AND imovel_id=? AND categoria='Fotos' AND mime LIKE 'image/%'", req.params.fid, k.imovel_id) || falha(404, 'Foto não encontrada.');
  const buf = require('../services/conteudo').ler(f) || falha(404, 'Foto não encontrada.');
  res.setHeader('Content-Type', f.mime); res.setHeader('Cache-Control', 'private, max-age=3600'); res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(buf);
});

module.exports = r;

// ---- webhook WhatsApp (corpo bruto para conferir a assinatura da Meta) ----
module.exports.webhook = express.Router()
  .get('/', (req, res) => {
    if (cfg.WA_VERIFY_TOKEN && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === cfg.WA_VERIFY_TOKEN) return res.type('text').send(String(req.query['hub.challenge']));
    res.sendStatus(403);
  })
  .post('/', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
    if (!wa.assinaturaValida(req.body, req.headers['x-hub-signature-256'])) return res.sendStatus(401);
    res.sendStatus(200); // responde rápido; processa em seguida
    try { wa.processaWebhook(JSON.parse(req.body.toString('utf8'))); } catch {}
  });
