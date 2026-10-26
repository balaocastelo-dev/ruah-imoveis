// Abrir arquivos (sempre conferindo permissão) e conexão com o Google Drive.
const express = require('express');
const fs = require('fs');
const path = require('path');
const A = require('../auth');
const cfg = require('../config');
const { one, setConfig, getConfig, audit } = require('../db');
const { falha, imovelPermitido } = require('../util');
const drive = require('../services/drive');

const r = express.Router();

function enviaArquivo(res, nome, mime, buffer, baixar) {
  res.setHeader('Content-Type', mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${baixar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!/^(image\/|application\/pdf)/.test(mime || '')) res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.end(buffer);
}

// Callback do Google (precisa estar antes do exigeLogin para receber o redirecionamento; o state amarra ao admin)
r.get('/drive/callback', async (req, res) => {
  const u = A.usuarioDaSessao(req);
  const st = getConfig('drive_state');
  setConfig('drive_state', null);
  const volta = (msg) => res.redirect('/#/configuracoes?drive=' + encodeURIComponent(msg));
  if (!u || u.perfil !== 'adm') return volta('Entre como administrador para conectar o Drive.');
  if (!st || !req.query.state) return volta('Pedido de conexão expirado. Tente de novo.');
  const [esperado, exp] = st.split('|');
  if (esperado !== req.query.state || Number(exp) < Date.now()) return volta('Pedido de conexão expirado. Tente de novo.');
  if (req.query.error) return volta('Conexão cancelada no Google.');
  try { await drive.trocaCodigo(String(req.query.code || '')); audit(u.id, 'drive_conectado', getConfig('drive_email')); volta('ok'); }
  catch (e) { volta(e.message); }
});


r.get('/arquivos/:id', (req, res) => {
  const a = one('SELECT * FROM arquivos WHERE id=?', req.params.id) || falha(404, 'Arquivo não encontrado.');
  imovelPermitido(req.usuario, a.imovel_id);
  const buf = require('../services/conteudo').ler(a) || falha(404, 'Arquivo não encontrado no armazenamento.');
  enviaArquivo(res, a.nome, a.mime, buf, req.query.baixar);
});

// Arquivo colocado direto no Drive: só abre se estiver dentro da pasta deste imóvel.
r.get('/drive/arquivo/:imovelId/:fileId', async (req, res) => {
  const im = imovelPermitido(req.usuario, req.params.imovelId);
  if (!drive.conectado() || !im.drive_subpastas) falha(400, 'Google Drive não conectado.');
  const permitidas = new Set(Object.values(JSON.parse(im.drive_subpastas)));
  const arquivos = [];
  for (const pid of permitidas) arquivos.push(...await drive.listarPasta(pid));
  const f = arquivos.find((x) => x.id === req.params.fileId) || falha(403, 'Este arquivo não pertence à pasta do imóvel.');
  if (f.mimeType.startsWith('application/vnd.google-apps')) return res.redirect(f.webViewLink);
  const { buffer, mime } = await drive.baixar(f.id);
  enviaArquivo(res, f.name, mime, buffer, req.query.baixar);
});

r.get('/drive/conectar', A.exigePerfil('adm'), (req, res) => {
  if (!drive.configurado()) falha(400, 'Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no arquivo .env e reinicie o sistema.');
  const state = A.tokenAleatorio(18);
  setConfig('drive_state', `${state}|${Date.now() + 10 * 60e3}`);
  res.json({ url: drive.urlAutorizacao(state) });
});
r.post('/drive/desconectar', A.exigePerfil('adm'), (req, res) => { drive.desconectar(); audit(req.usuario.id, 'drive_desconectado'); res.json({ ok: true }); });
r.post('/drive/enviar-pendentes', A.exigePerfil('adm', 'gestor'), async (req, res) => {
  if (!drive.conectado()) falha(400, 'Conecte o Google Drive primeiro.');
  res.json(await drive.enviarPendentes());
});

module.exports = r;
