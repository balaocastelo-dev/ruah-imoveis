// CRM: leads, funil, histórico, match, visitas e WhatsApp.
const express = require('express');
const A = require('../auth');
const cfg = require('../config');
const { one, all, run, audit } = require('../db');
const { falha, num, int, txt, leadPermitido, imovelPermitido } = require('../util');
const match = require('../services/match');
const wa = require('../services/whatsapp');

const r = express.Router();

const ETAPAS = ['novo', 'qualificado', 'visita', 'proposta', 'escritura', 'perdido'];
const TEMP = ['quente', 'morno', 'frio'];

function camposLead(b, u) {
  if (b.etapa && !ETAPAS.includes(b.etapa)) falha(400, 'Etapa inválida.');
  if (b.temperatura && !TEMP.includes(b.temperatura)) falha(400, 'Temperatura inválida.');
  return {
    nome: txt(b.nome, 120), telefone: b.telefone ? wa.normTel(b.telefone) : null, email: txt(b.email, 120), origem: txt(b.origem, 60),
    etapa: b.etapa || 'novo', temperatura: b.temperatura || 'morno', busca: txt(b.busca, 500),
    tipo_desejado: txt(b.tipo_desejado, 60), quartos_min: int(b.quartos_min), vagas_min: int(b.vagas_min), valor_max: num(b.valor_max), bairros: txt(b.bairros, 300),
    nao_contatar: b.nao_contatar ? 1 : 0,
    corretor_id: A.veTudo(u) ? (int(b.corretor_id) || null) : u.id,
  };
}

r.get('/leads', (req, res) => {
  const u = req.usuario; const p = []; let w = 'WHERE 1=1';
  if (!A.veTudo(u)) { w += ' AND l.corretor_id=?'; p.push(u.id); }
  if (req.query.q) { w += ' AND (l.nome LIKE ? OR l.telefone LIKE ? OR l.busca LIKE ?)'; const q = `%${req.query.q}%`; p.push(q, q, q); }
  res.json(all(`SELECT l.*, u.nome corretor_nome,
      (SELECT texto FROM mensagens m WHERE m.lead_id=l.id AND m.direcao!='sugestao' ORDER BY id DESC LIMIT 1) ultima_msg
      FROM leads l LEFT JOIN usuarios u ON u.id=l.corretor_id ${w} ORDER BY coalesce(l.ultimo_contato,l.criado_em) DESC LIMIT 1000`, ...p));
});

r.post('/leads', (req, res) => {
  const c = camposLead(req.body || {}, req.usuario);
  if (!c.nome) falha(400, 'Informe o nome do cliente.');
  if (c.telefone && one('SELECT id FROM leads WHERE telefone=?', c.telefone)) falha(409, 'Já existe um lead com este telefone.');
  const cols = Object.keys(c);
  const id = Number(run(`INSERT INTO leads(${cols.join(',')},ultimo_contato) VALUES(${cols.map(() => '?').join(',')},datetime('now','localtime'))`, ...cols.map((k) => c[k])).lastInsertRowid);
  run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', id, 'sistema', `Lead cadastrado por ${req.usuario.nome}.`, req.usuario.id);
  res.json({ id });
});

r.get('/leads/:id', (req, res) => {
  const l = leadPermitido(req.usuario, req.params.id);
  res.json({
    ...l, corretor_nome: l.corretor_id ? one('SELECT nome FROM usuarios WHERE id=?', l.corretor_id).nome : null,
    interacoes: all('SELECT i.*, u.nome autor FROM interacoes i LEFT JOIN usuarios u ON u.id=i.autor_id WHERE lead_id=? ORDER BY i.id DESC LIMIT 100', l.id),
    visitas: all("SELECT v.*, i.codigo, (SELECT min(f.id) FROM arquivos f WHERE f.imovel_id=i.id AND f.categoria='Fotos' AND f.mime LIKE 'image/%') capa FROM visitas v JOIN imoveis i ON i.id=v.imovel_id WHERE v.lead_id=? ORDER BY v.data_hora DESC", l.id),
    imoveis: match.imoveisParaLead(l.id),
  });
});

r.put('/leads/:id', (req, res) => {
  const l = leadPermitido(req.usuario, req.params.id);
  const c = camposLead({ ...l, ...req.body }, req.usuario);
  if (!A.veTudo(req.usuario)) c.corretor_id = l.corretor_id;
  if (!c.nome) falha(400, 'Informe o nome do cliente.');
  const cols = Object.keys(c);
  run(`UPDATE leads SET ${cols.map((k) => k + '=?').join(',')} WHERE id=?`, ...cols.map((k) => c[k]), l.id);
  if (c.etapa !== l.etapa) run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', l.id, 'etapa', `Etapa: ${l.etapa} → ${c.etapa}`, req.usuario.id);
  if (c.corretor_id !== l.corretor_id) run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', l.id, 'sistema', 'Lead transferido de corretor.', req.usuario.id);
  res.json({ ok: true });
});

r.patch('/leads/:id/etapa', (req, res) => {
  const l = leadPermitido(req.usuario, req.params.id);
  if (!ETAPAS.includes(req.body.etapa)) falha(400, 'Etapa inválida.');
  if (req.body.etapa !== l.etapa) {
    run('UPDATE leads SET etapa=? WHERE id=?', req.body.etapa, l.id);
    run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', l.id, 'etapa', `Etapa: ${l.etapa} → ${req.body.etapa}`, req.usuario.id);
  }
  res.json({ ok: true });
});

r.post('/leads/:id/nota', (req, res) => {
  const l = leadPermitido(req.usuario, req.params.id);
  const t = txt(req.body.texto, 2000) || falha(400, 'Escreva a anotação.');
  run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', l.id, 'nota', t, req.usuario.id);
  res.json({ ok: true });
});

// ---- visitas ----
r.get('/visitas', (req, res) => {
  const u = req.usuario;
  res.json(all(`SELECT v.*, l.nome lead, l.telefone, i.codigo, i.logradouro, i.numero, c.nome condominio, us.nome corretor, (SELECT min(f.id) FROM arquivos f WHERE f.imovel_id=i.id AND f.categoria='Fotos' AND f.mime LIKE 'image/%') capa FROM visitas v
     JOIN leads l ON l.id=v.lead_id JOIN imoveis i ON i.id=v.imovel_id LEFT JOIN condominios c ON c.id=i.condominio_id LEFT JOIN usuarios us ON us.id=v.corretor_id
     WHERE date(v.data_hora) >= date('now','localtime','-30 day') ${A.veTudo(u) ? '' : 'AND v.corretor_id=' + u.id} ORDER BY v.data_hora`));
});
r.post('/visitas', (req, res) => {
  const l = leadPermitido(req.usuario, req.body.lead_id);
  const im = one('SELECT * FROM imoveis WHERE id=?', req.body.imovel_id) || falha(404, 'Imóvel não encontrado.');
  const dh = txt(req.body.data_hora, 16);
  if (!dh || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dh)) falha(400, 'Informe data e hora da visita.');
  const corretor = A.veTudo(req.usuario) ? (int(req.body.corretor_id) || l.corretor_id || req.usuario.id) : req.usuario.id;
  const id = Number(run('INSERT INTO visitas(lead_id,imovel_id,corretor_id,data_hora) VALUES(?,?,?,?)', l.id, im.id, corretor, dh.replace('T', ' ')).lastInsertRowid);
  run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', l.id, 'visita', `Visita ao ${im.codigo} agendada para ${dh.replace('T', ' ')}.`, req.usuario.id);
  if (['novo', 'qualificado'].includes(l.etapa)) run("UPDATE leads SET etapa='visita' WHERE id=?", l.id);
  res.json({ id });
});
r.patch('/visitas/:id', (req, res) => {
  const v = one('SELECT * FROM visitas WHERE id=?', req.params.id) || falha(404, 'Visita não encontrada.');
  if (!A.veTudo(req.usuario) && v.corretor_id !== req.usuario.id) falha(403, 'Visita de outro corretor.');
  const st = req.body.status;
  if (st && !['agendada', 'confirmada', 'realizada', 'cancelada'].includes(st)) falha(400, 'Status inválido.');
  run('UPDATE visitas SET status=coalesce(?,status), avaliacao=coalesce(?,avaliacao) WHERE id=?', st || null, txt(req.body.avaliacao, 500), v.id);
  if (st) run('INSERT INTO interacoes(lead_id,tipo,texto,autor_id) VALUES(?,?,?,?)', v.lead_id, 'visita', `Visita ${st}${req.body.avaliacao ? ': ' + req.body.avaliacao : ''}.`, req.usuario.id);
  res.json({ ok: true });
});

// ---- WhatsApp ----
r.get('/whats', (req, res) => {
  const u = req.usuario;
  res.json({
    modo: wa.modo(), ia: cfg.IA_MODO,
    conversas: all(`SELECT l.id, l.nome, l.telefone, l.temperatura, l.nao_contatar, us.nome corretor, m.texto ultima, m.direcao, m.criado_em,
       EXISTS(SELECT 1 FROM mensagens s WHERE s.lead_id=l.id AND s.direcao='sugestao') tem_sugestao
       FROM leads l JOIN mensagens m ON m.id=(SELECT max(id) FROM mensagens WHERE lead_id=l.id AND direcao!='sugestao')
       LEFT JOIN usuarios us ON us.id=l.corretor_id ${A.veTudo(u) ? '' : 'WHERE l.corretor_id=' + u.id} ORDER BY m.id DESC LIMIT 200`),
  });
});
r.get('/whats/:leadId', (req, res) => {
  const l = leadPermitido(req.usuario, req.params.leadId);
  res.json({ lead: l, mensagens: all('SELECT * FROM mensagens WHERE lead_id=? ORDER BY id', l.id) });
});
r.post('/whats/:leadId/enviar', async (req, res) => {
  const l = leadPermitido(req.usuario, req.params.leadId);
  const texto = txt(req.body.texto, 4000) || falha(400, 'Escreva a mensagem.');
  if (l.nao_contatar) falha(400, 'Este cliente pediu para não receber mensagens.');
  if (!l.telefone) falha(400, 'Lead sem telefone.');
  const env = await wa.enviarTexto(l.telefone, texto);
  run(`DELETE FROM mensagens WHERE lead_id=? AND direcao='sugestao'`, l.id);
  run('INSERT INTO mensagens(lead_id,telefone,direcao,texto,status,wa_id,autor) VALUES(?,?,?,?,?,?,?)', l.id, l.telefone, 'saida', texto, env.status, env.wa_id, req.usuario.nome + (req.body.da_ia ? ' (aprovou IA)' : ''));
  run("UPDATE leads SET ultimo_contato=datetime('now','localtime') WHERE id=?", l.id);
  res.json({ ok: true, status: env.status });
});
r.post('/whats/:leadId/sugerir', async (req, res) => {
  const l = leadPermitido(req.usuario, req.params.leadId);
  const t = await wa.gerarSugestao(l.id);
  if (!t) falha(503, 'IA local indisponível. Abra o Ollama no PC e tente de novo.');
  res.json({ ok: true });
});
r.post('/whats/simular', async (req, res) => {
  if (wa.modo() !== 'simulado') falha(400, 'Simulação só funciona sem a API oficial configurada.');
  const { telefone, nome, texto } = req.body || {};
  if (!txt(texto) || String(telefone || '').replace(/\D/g, '').length < 10) falha(400, 'Informe telefone com DDD e a mensagem.');
  const lead = await wa.recebida({ telefone, nome: txt(nome, 80), texto: txt(texto, 2000) });
  res.json({ lead_id: lead.id });
});

module.exports = r;
