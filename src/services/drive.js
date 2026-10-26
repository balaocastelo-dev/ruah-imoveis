// Integração direta com o Google Drive (API REST oficial, login OAuth do Google).
// Sem conexão, os arquivos ficam guardados no PC e sobem depois com "Enviar pendentes".
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { getConfig, setConfig, one, run, all } = require('../db');
const conteudo = require('./conteudo');
const { cifrar, decifrar } = require('../auth');

const SUBPASTAS = ['Fotos', 'Documentos do proprietário', 'Matrícula e certidões', 'Autorização de venda', 'Contratos', 'Propostas', 'Vídeo e anúncios'];
const FOLDER = 'application/vnd.google-apps.folder';
const API = 'https://www.googleapis.com/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive';
const redirectUri = () => `${cfg.BASE_URL}/api/drive/callback`;

const configurado = () => !!(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET);
const conectado = () => configurado() && !!getConfig('drive_refresh');

function urlAutorizacao(state) {
  const p = new URLSearchParams({
    client_id: cfg.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function trocaCodigo(code) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: cfg.GOOGLE_CLIENT_ID, client_secret: cfg.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
  });
  const j = await r.json();
  if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || 'O Google não devolveu a autorização. Tente de novo.');
  setConfig('drive_refresh', cifrar(j.refresh_token));
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  setConfig('drive_raiz_id', null);
  try { const sobre = await api('GET', `${API}/about?fields=user(emailAddress,displayName)`); setConfig('drive_email', sobre.user.emailAddress); } catch {}
}

let cache = { token: null, exp: 0 };
async function accessToken() {
  if (cache.token && cache.exp > Date.now()) return cache.token;
  const enc = getConfig('drive_refresh');
  if (!enc) throw new Error('Google Drive não conectado.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: decifrar(enc), client_id: cfg.GOOGLE_CLIENT_ID, client_secret: cfg.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!r.ok) {
    if (j.error === 'invalid_grant') desconectar();
    throw new Error('A conexão com o Google expirou. Conecte o Drive de novo em Configurações.');
  }
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cache.token;
}

function desconectar() { setConfig('drive_refresh', null); setConfig('drive_email', null); setConfig('drive_raiz_id', null); cache = { token: null, exp: 0 }; }

async function api(method, url, body, extraHeaders = {}) {
  const r = await fetch(url, {
    method, headers: { Authorization: `Bearer ${await accessToken()}`, ...(body && !(body instanceof Buffer) ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
    body: body ? (body instanceof Buffer ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`Google Drive respondeu ${r.status}: ${t.slice(0, 200)}`); }
  return r.status === 204 ? null : r.json();
}

const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
async function buscaPasta(nome, paiId) {
  const query = `name='${q(nome)}' and '${paiId}' in parents and mimeType='${FOLDER}' and trashed=false`;
  const j = await api('GET', `${API}/files?q=${encodeURIComponent(query)}&fields=files(id,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return j.files[0] || null;
}
async function criaPasta(nome, paiId) {
  return api('POST', `${API}/files?supportsAllDrives=true&fields=id,webViewLink`, { name: nome, mimeType: FOLDER, parents: [paiId] });
}
async function garantePasta(nome, paiId) { return (await buscaPasta(nome, paiId)) || criaPasta(nome, paiId); }

async function raiz() {
  if (cfg.DRIVE_ROOT_FOLDER_ID) return cfg.DRIVE_ROOT_FOLDER_ID;
  const salvo = getConfig('drive_raiz_id');
  if (salvo) return salvo;
  const p = await garantePasta(cfg.DRIVE_ROOT_NAME, 'root');
  setConfig('drive_raiz_id', p.id);
  return p.id;
}

const nomePasta = (im) => `${im.codigo} – ${im.condominio_nome || [im.logradouro, im.numero].filter(Boolean).join(', ') || im.tipo}`.replace(/[\/\\]/g, '-');

async function garantePastaImovel(imovelId) {
  const im = one('SELECT i.*, c.nome condominio_nome FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id WHERE i.id=?', imovelId);
  if (im.drive_pasta_id && im.drive_subpastas) return { pasta: im.drive_pasta_id, sub: JSON.parse(im.drive_subpastas) };
  const pai = await raiz();
  const pasta = await garantePasta(nomePasta(im), pai);
  const sub = {};
  for (const s of SUBPASTAS) sub[s] = (await garantePasta(s, pasta.id)).id;
  run('UPDATE imoveis SET drive_pasta_id=?, drive_subpastas=? WHERE id=?', pasta.id, JSON.stringify(sub), imovelId);
  return { pasta: pasta.id, sub };
}

async function upload(pastaId, nome, mime, buffer) {
  const limite = 'ruah' + Date.now().toString(36);
  const meta = JSON.stringify({ name: nome, parents: [pastaId] });
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${limite}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`),
    buffer, Buffer.from(`\r\n--${limite}--`),
  ]);
  return api('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', corpo, { 'Content-Type': `multipart/related; boundary=${limite}` });
}

// Arquivos que alguém colocou direto no Drive também aparecem no sistema.
async function listarPasta(pastaId) {
  const query = `'${pastaId}' in parents and trashed=false`;
  const j = await api('GET', `${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,webViewLink,modifiedTime)&orderBy=name&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return j.files;
}
async function baixar(fileId) {
  const r = await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!r.ok) throw new Error(`Não consegui baixar do Drive (${r.status}).`);
  return { buffer: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') };
}

// Guarda sempre uma cópia no PC e envia ao Drive quando conectado.
const pastaLocal = (codigo, categoria) => path.join(cfg.DATA_DIR, 'arquivos', codigo, categoria.replace(/[\/\\:*?"<>|]/g, '-'));
async function salvarArquivo({ imovelId, categoria, nome, mime, buffer, usuarioId }) {
  if (!SUBPASTAS.includes(categoria)) throw new Error('Categoria de arquivo inválida.');
  const im = one('SELECT codigo FROM imoveis WHERE id=?', imovelId);
  const seguro = nome.replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').slice(0, 150);
  if (conteudo.PG) {
    const r = run('INSERT INTO arquivos(imovel_id,categoria,nome,mime,tamanho,caminho_local,enviado_por) VALUES(?,?,?,?,?,?,?)',
      imovelId, categoria, seguro, mime, buffer.length, null, usuarioId ?? null);
    const id = Number(r.lastInsertRowid);
    conteudo.gravar(id, buffer);
    let aviso = null;
    if (conectado()) { try { await enviarAoDrive(id); } catch (e) { aviso = e.message; } }
    return { id, aviso };
  }
  const dir = pastaLocal(im.codigo, categoria);
  fs.mkdirSync(dir, { recursive: true });
  let destino = path.join(dir, seguro);
  if (fs.existsSync(destino)) destino = path.join(dir, `${Date.now()}-${seguro}`);
  fs.writeFileSync(destino, buffer);
  const r = run('INSERT INTO arquivos(imovel_id,categoria,nome,mime,tamanho,caminho_local,enviado_por) VALUES(?,?,?,?,?,?,?)',
    imovelId, categoria, seguro, mime, buffer.length, path.relative(cfg.DATA_DIR, destino), usuarioId ?? null);
  const id = Number(r.lastInsertRowid);
  let aviso = null;
  if (conectado()) {
    try { await enviarAoDrive(id); } catch (e) { aviso = e.message; }
  }
  return { id, aviso };
}

async function enviarAoDrive(arquivoId) {
  const a = one('SELECT * FROM arquivos WHERE id=?', arquivoId);
  if (a.drive_id) return a;
  const { sub } = await garantePastaImovel(a.imovel_id);
  const buf = conteudo.ler(a);
  if (!buf) throw new Error(`Arquivo ${a.nome} sem conteúdo guardado.`);
  const f = await upload(sub[a.categoria], a.nome, a.mime, buf);
  run('UPDATE arquivos SET drive_id=?, drive_link=? WHERE id=?', f.id, f.webViewLink, arquivoId);
  return { ...a, drive_id: f.id };
}

async function enviarPendentes() {
  const pend = all('SELECT id FROM arquivos WHERE drive_id IS NULL');
  let ok = 0; const erros = [];
  for (const p of pend) { try { await enviarAoDrive(p.id); ok++; } catch (e) { erros.push(e.message); } }
  return { enviados: ok, pendentes: pend.length - ok, erros: erros.slice(0, 3) };
}

function status() {
  return {
    configurado: configurado(), conectado: conectado(), conta: getConfig('drive_email'),
    raiz: cfg.DRIVE_ROOT_FOLDER_ID ? 'Pasta/Drive compartilhado definido no .env' : cfg.DRIVE_ROOT_NAME,
    pendentes: one('SELECT count(*) n FROM arquivos WHERE drive_id IS NULL').n,
    redirect: redirectUri(),
  };
}

module.exports = { SUBPASTAS, configurado, conectado, urlAutorizacao, trocaCodigo, desconectar, garantePastaImovel, listarPasta, baixar, salvarArquivo, enviarPendentes, status };
