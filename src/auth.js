// Login, sessões, perfis de acesso e criptografia de segredos guardados no banco.
const crypto = require('crypto');
const { one, run, audit } = require('./db');
const { SECRET_KEY } = require('./config');

const SESSAO_HORAS = 12;
const COOKIE = 'ruah_sessao';

// ---- senhas (scrypt, embutido no Node) ----
function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function confereSenha(senha, armazenado) {
  const [alg, saltHex, hHex] = String(armazenado).split('$');
  if (alg !== 'scrypt') return false;
  const h = crypto.scryptSync(senha, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(hHex, 'hex');
  return ref.length === h.length && crypto.timingSafeEqual(ref, h);
}
function senhaValida(s) {
  return typeof s === 'string' && s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const tokenAleatorio = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

// ---- sessões ----
function criarSessao(usuarioId) {
  const token = tokenAleatorio(32);
  run('DELETE FROM sessoes WHERE expira_em < ?', Date.now());
  run('INSERT INTO sessoes(token_hash,usuario_id,expira_em) VALUES(?,?,?)', sha256(token), usuarioId, Date.now() + SESSAO_HORAS * 3600e3);
  return token;
}
function encerrarSessao(token) { if (token) run('DELETE FROM sessoes WHERE token_hash=?', sha256(token)); }

function lerCookie(req, nome) {
  const c = req.headers.cookie || '';
  for (const part of c.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}
function setCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSAO_HORAS * 3600}`);
}
function limparCookie(res) { res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`); }

function usuarioDaSessao(req) {
  const token = lerCookie(req, COOKIE);
  if (!token) return null;
  const s = one(`SELECT u.id,u.nome,u.email,u.perfil,u.telefone FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
                 WHERE s.token_hash=? AND s.expira_em>? AND u.ativo=1`, sha256(token), Date.now());
  return s || null;
}

// ---- proteção contra tentativa de senha em sequência ----
function podeTentar(chave) {
  const r = one('SELECT * FROM tentativas_login WHERE chave=?', chave);
  return !r || r.bloqueado_ate < Date.now();
}
function registraFalha(chave) {
  const r = one('SELECT * FROM tentativas_login WHERE chave=?', chave);
  const falhas = (r ? r.falhas : 0) + 1;
  const bloqueio = falhas >= 5 ? Date.now() + 15 * 60e3 : 0;
  run('INSERT INTO tentativas_login(chave,falhas,bloqueado_ate) VALUES(?,?,?) ON CONFLICT(chave) DO UPDATE SET falhas=excluded.falhas, bloqueado_ate=excluded.bloqueado_ate',
    chave, bloqueio ? 0 : falhas, bloqueio);
}
function limpaFalhas(chave) { run('DELETE FROM tentativas_login WHERE chave=?', chave); }

// ---- middlewares ----
function exigeLogin(req, res, next) {
  const u = usuarioDaSessao(req);
  if (!u) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  req.usuario = u;
  next();
}
const exigePerfil = (...perfis) => (req, res, next) => {
  if (!perfis.includes(req.usuario.perfil)) return res.status(403).json({ erro: 'Seu perfil não tem acesso a esta função.' });
  next();
};
// Bloqueia requisições de escrita vindas de outro site (CSRF), além do SameSite=Lax.
function mesmaOrigem(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origem = req.headers.origin;
  if (origem) {
    try {
      if (new URL(origem).host !== req.headers.host) return res.status(403).json({ erro: 'Origem não permitida.' });
    } catch { return res.status(403).json({ erro: 'Origem inválida.' }); }
  }
  next();
}

const veTudo = (u) => u.perfil === 'adm' || u.perfil === 'gestor';

// ---- criptografia de segredos (tokens do Google) ----
function chave() {
  if (!SECRET_KEY || SECRET_KEY.length < 32) throw new Error('SECRET_KEY ausente ou curta no .env');
  return crypto.createHash('sha256').update(SECRET_KEY).digest();
}
function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decifrar(pacote) {
  const [iv, tag, enc] = pacote.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', chave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

module.exports = {
  hashSenha, confereSenha, senhaValida, sha256, tokenAleatorio,
  criarSessao, encerrarSessao, lerCookie, setCookie, limparCookie, usuarioDaSessao, COOKIE,
  podeTentar, registraFalha, limpaFalhas,
  exigeLogin, exigePerfil, mesmaOrigem, veTudo, cifrar, decifrar, audit,
};
