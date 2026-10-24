// Primeiro acesso, login, usuários, painel e status das integrações.
const express = require('express');
const A = require('../auth');
const { one, all, run, audit } = require('../db');
const { falha, txt } = require('../util');
const drive = require('../services/drive');
const wa = require('../services/whatsapp');
const ia = require('../services/ia');
const cfg = require('../config');
const { seedExemplo } = require('../seed');

const r = express.Router();

r.get('/setup', (req, res) => res.json({ precisa: one('SELECT count(*) n FROM usuarios').n === 0, empresa: cfg.EMPRESA }));
r.post('/setup', (req, res) => {
  if (one('SELECT count(*) n FROM usuarios').n > 0) falha(409, 'O administrador já foi criado. Entre com seu login.');
  const { nome, email, senha, exemplo } = req.body || {};
  if (!txt(nome) || !/^\S+@\S+\.\S+$/.test(email || '')) falha(400, 'Informe nome e e-mail válidos.');
  if (!A.senhaValida(senha)) falha(400, 'A senha precisa ter 8 caracteres ou mais, com letras e números.');
  const id = Number(run('INSERT INTO usuarios(nome,email,perfil,senha_hash) VALUES(?,?,?,?)', txt(nome, 100), email.trim(), 'adm', A.hashSenha(senha)).lastInsertRowid);
  audit(id, 'setup', 'Administrador criado');
  const extra = exemplo ? seedExemplo() : null;
  A.setCookie(res, A.criarSessao(id));
  res.json({ ok: true, exemplo: extra });
});

r.post('/login', (req, res) => {
  const { email, senha } = req.body || {};
  const chave = `${req.ip}|${String(email || '').toLowerCase()}`;
  if (!A.podeTentar(chave)) falha(429, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
  const u = one('SELECT * FROM usuarios WHERE email=? AND ativo=1', String(email || '').trim());
  if (!u || !A.confereSenha(String(senha || ''), u.senha_hash)) { A.registraFalha(chave); falha(401, 'E-mail ou senha incorretos.'); }
  A.limpaFalhas(chave);
  A.setCookie(res, A.criarSessao(u.id));
  audit(u.id, 'login', req.ip);
  res.json({ ok: true });
});
r.post('/logout', (req, res) => { A.encerrarSessao(A.lerCookie(req, A.COOKIE)); A.limparCookie(res); res.json({ ok: true }); });


r.get('/me', (req, res) => res.json(req.usuario));
r.post('/me/senha', (req, res) => {
  const { atual, nova } = req.body || {};
  const u = one('SELECT * FROM usuarios WHERE id=?', req.usuario.id);
  if (!A.confereSenha(String(atual || ''), u.senha_hash)) falha(400, 'Senha atual incorreta.');
  if (!A.senhaValida(nova)) falha(400, 'A nova senha precisa ter 8 caracteres ou mais, com letras e números.');
  run('UPDATE usuarios SET senha_hash=? WHERE id=?', A.hashSenha(nova), u.id);
  res.json({ ok: true });
});

r.post('/me/telefone', (req, res) => {
  const t = String((req.body || {}).telefone || '').replace(/\D/g, '');
  if (t && (t.length < 10 || t.length > 13)) falha(400, 'Informe o celular com DDD.');
  run('UPDATE usuarios SET telefone=? WHERE id=?', t || null, req.usuario.id);
  res.json({ ok: true });
});

// ---- usuários (só administrativo) ----
r.get('/usuarios', (req, res) => {
  const campos = A.veTudo(req.usuario) ? 'id,nome,email,telefone,perfil,ativo,criado_em' : 'id,nome,perfil';
  res.json(all(`SELECT ${campos} FROM usuarios ${A.veTudo(req.usuario) ? '' : 'WHERE ativo=1'} ORDER BY ativo DESC, nome`));
});
r.post('/usuarios', A.exigePerfil('adm'), (req, res) => {
  const { nome, email, telefone, perfil, senha } = req.body || {};
  if (!txt(nome) || !/^\S+@\S+\.\S+$/.test(email || '')) falha(400, 'Informe nome e e-mail válidos.');
  if (!['adm', 'gestor', 'corretor'].includes(perfil)) falha(400, 'Perfil inválido.');
  if (!A.senhaValida(senha)) falha(400, 'A senha precisa ter 8 caracteres ou mais, com letras e números.');
  if (one('SELECT id FROM usuarios WHERE email=?', email.trim())) falha(409, 'Já existe um usuário com este e-mail.');
  const id = run('INSERT INTO usuarios(nome,email,telefone,perfil,senha_hash) VALUES(?,?,?,?,?)', txt(nome, 100), email.trim(), txt(telefone, 30), perfil, A.hashSenha(senha)).lastInsertRowid;
  audit(req.usuario.id, 'usuario_criado', email);
  res.json({ id: Number(id) });
});
r.patch('/usuarios/:id', A.exigePerfil('adm'), (req, res) => {
  const u = one('SELECT * FROM usuarios WHERE id=?', req.params.id) || falha(404, 'Usuário não encontrado.');
  const b = req.body || {};
  if (u.id === req.usuario.id && (b.ativo === 0 || (b.perfil && b.perfil !== 'adm'))) falha(400, 'Você não pode desativar ou rebaixar o próprio acesso.');
  if (b.perfil && !['adm', 'gestor', 'corretor'].includes(b.perfil)) falha(400, 'Perfil inválido.');
  if (b.senha && !A.senhaValida(b.senha)) falha(400, 'A senha precisa ter 8 caracteres ou mais, com letras e números.');
  run('UPDATE usuarios SET nome=coalesce(?,nome), telefone=coalesce(?,telefone), perfil=coalesce(?,perfil), ativo=coalesce(?,ativo) WHERE id=?',
    txt(b.nome, 100), txt(b.telefone, 30), b.perfil || null, b.ativo === undefined ? null : (b.ativo ? 1 : 0), u.id);
  if (b.senha) run('UPDATE usuarios SET senha_hash=? WHERE id=?', A.hashSenha(b.senha), u.id);
  if (b.ativo === 0 || b.senha) run('DELETE FROM sessoes WHERE usuario_id=?', u.id);
  audit(req.usuario.id, 'usuario_alterado', u.email);
  res.json({ ok: true });
});

// ---- painel ----
r.get('/painel', (req, res) => {
  const u = req.usuario, todos = A.veTudo(u);
  const fI = todos ? '' : ' AND i.corretor_id=' + u.id, fL = todos ? '' : ' AND l.corretor_id=' + u.id;
  const kpis = {
    imoveis: one(`SELECT count(*) n FROM imoveis i WHERE status NOT IN ('vendido','suspenso')${fI}`).n,
    publicados: one(`SELECT count(*) n FROM imoveis i WHERE status='publicado'${fI}`).n,
    leads: one(`SELECT count(*) n FROM leads l WHERE etapa NOT IN ('escritura','perdido')${fL}`).n,
    quentes: one(`SELECT count(*) n FROM leads l WHERE temperatura='quente' AND etapa NOT IN ('escritura','perdido')${fL}`).n,
  };
  const visitas = all(`SELECT v.*, l.nome lead, i.codigo, u.nome corretor, (SELECT min(f.id) FROM arquivos f WHERE f.imovel_id=i.id AND f.categoria='Fotos' AND f.mime LIKE 'image/%') capa FROM visitas v JOIN leads l ON l.id=v.lead_id JOIN imoveis i ON i.id=v.imovel_id
     LEFT JOIN usuarios u ON u.id=v.corretor_id WHERE date(v.data_hora) BETWEEN date('now','localtime') AND date('now','localtime','+2 day')
     AND v.status IN ('agendada','confirmada') ${todos ? '' : 'AND v.corretor_id=' + u.id} ORDER BY v.data_hora LIMIT 8`);
  const aguardando = all(`SELECT l.id, l.nome, m.texto, m.criado_em FROM leads l JOIN mensagens m ON m.id=(SELECT max(id) FROM mensagens WHERE lead_id=l.id AND direcao!='sugestao')
     WHERE m.direcao='entrada' ${fL} ORDER BY m.id DESC LIMIT 6`);
  const sugestoes = one(`SELECT count(*) n FROM mensagens m JOIN leads l ON l.id=m.lead_id WHERE m.direcao='sugestao' ${fL}`).n;
  const CARD = `SELECT i.id, i.codigo, i.tipo, i.status, i.exclusivo, i.bairro, i.cidade, i.logradouro, i.numero, i.quartos, i.suites, i.vagas, i.area_util, i.valor,
     c.nome condominio_nome, c.nome condominio, u.nome corretor_nome FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id LEFT JOIN usuarios u ON u.id=i.corretor_id`;
  const { leadsParaImovel, fotosDe } = require('../services/match');
  const novos = all(`${CARD} WHERE i.criado_em >= datetime('now','localtime','-7 day') ${fI} ORDER BY i.id DESC LIMIT 6`);
  for (const n of novos) { Object.assign(n, fotosDe(n.id)); n.compradores = leadsParaImovel(n.id, 3); }
  const ids = novos.map((n) => n.id);
  const vitrine = all(`${CARD} WHERE i.status IN ('publicado','off_market') ${fI} ${ids.length ? `AND i.id NOT IN (${ids.join(',')})` : ''} ORDER BY i.atualizado_em DESC LIMIT 8`);
  for (const v of vitrine) Object.assign(v, fotosDe(v.id));
  res.json({ kpis, visitas, aguardando, sugestoes, novos, vitrine });
});

r.get('/integracoes', async (req, res) => {
  res.json({ drive: drive.status(), whatsapp: { modo: wa.modo(), webhook: (cfg.PUBLIC_URL || cfg.BASE_URL) + '/webhook/whatsapp', segredo: !!cfg.WA_APP_SECRET, verify: !!cfg.WA_VERIFY_TOKEN },
    ia: { ...(await ia.disponivel()), modo: cfg.IA_MODO, modelo: cfg.OLLAMA_MODEL }, public_url: cfg.PUBLIC_URL || null });
});

r.get('/auditoria', A.exigePerfil('adm'), (req, res) =>
  res.json(all('SELECT a.*, u.nome FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id ORDER BY a.id DESC LIMIT 200')));

module.exports = r;
