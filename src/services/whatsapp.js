// WhatsApp pela API oficial (Cloud API da Meta). Sem credenciais, roda em modo simulado para testes.
const crypto = require('crypto');
const cfg = require('../config');
const { one, run, all, audit } = require('../db');
const ia = require('./ia');

const modo = () => (cfg.WA_TOKEN && cfg.WA_PHONE_ID ? 'oficial' : 'simulado');
const normTel = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d; };

function assinaturaValida(rawBody, header) {
  if (!cfg.WA_APP_SECRET) return false; // sem segredo configurado, não aceitamos webhooks
  if (!header || !header.startsWith('sha256=')) return false;
  const esperado = crypto.createHmac('sha256', cfg.WA_APP_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(header.slice(7)), b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function enviarTexto(telefone, texto) {
  if (modo() === 'simulado') return { status: 'simulado', wa_id: null };
  const r = await fetch(`https://graph.facebook.com/v21.0/${cfg.WA_PHONE_ID}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: normTel(telefone), type: 'text', text: { body: texto } }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (!r.ok) {
    const msg = j.error && j.error.message || `HTTP ${r.status}`;
    if (/24|re-engagement|window/i.test(msg)) throw new Error('Passaram mais de 24h desde a última mensagem do cliente. A Meta só permite reabrir a conversa com um modelo aprovado.');
    throw new Error('WhatsApp recusou o envio: ' + msg);
  }
  return { status: 'enviado', wa_id: j.messages && j.messages[0] && j.messages[0].id };
}

// Distribui leads novos para o corretor com menos leads em aberto (rodízio).
function proximoCorretor() {
  const r = one(`SELECT u.id FROM usuarios u LEFT JOIN leads l ON l.corretor_id=u.id AND l.etapa IN ('novo','qualificado')
                 WHERE u.perfil='corretor' AND u.ativo=1 GROUP BY u.id ORDER BY count(l.id), u.id LIMIT 1`);
  return r ? r.id : null;
}

function leadPorTelefone(tel, nome) {
  const t = normTel(tel);
  let lead = one('SELECT * FROM leads WHERE telefone=? ORDER BY id DESC', t);
  if (!lead) {
    const r = run(`INSERT INTO leads(nome,telefone,origem,etapa,temperatura,corretor_id,ultimo_contato) VALUES(?,?,?,?,?,?,datetime('now','localtime'))`,
      nome || `WhatsApp ${t.slice(-4)}`, t, 'WhatsApp', 'novo', 'morno', proximoCorretor());
    lead = one('SELECT * FROM leads WHERE id=?', r.lastInsertRowid);
    run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', lead.id, 'sistema', 'Lead criado pela primeira mensagem no WhatsApp.');
  }
  return lead;
}

// Resposta à carta do radar: a mensagem do QR code traz "ref. OP-0012".
function vinculaCarta(lead, texto) {
  const m = String(texto || '').match(/OP-(\d{1,6})/i);
  if (!m) return;
  const op = one('SELECT * FROM oportunidades WHERE id=?', parseInt(m[1], 10));
  if (!op) return;
  const jaTem = one("SELECT 1 FROM oportunidade_eventos WHERE oportunidade_id=? AND etapa='carta' AND texto LIKE ?", op.id, `%lead #${lead.id}%`);
  if (jaTem) return;
  run('INSERT INTO oportunidade_eventos(oportunidade_id,etapa,texto) VALUES(?,?,?)', op.id, 'carta', `Proprietário respondeu à carta pelo WhatsApp (lead #${lead.id}, ${lead.telefone}).`);
  run(`UPDATE oportunidades SET titular_telefone=coalesce(titular_telefone,?), titular_origem=coalesce(titular_origem,'Respondeu à carta da RUAH'),
       status=CASE WHEN status IN ('nova','carta_enviada','em_contato') THEN 'em_contato' ELSE status END, atualizado_em=datetime('now','localtime') WHERE id=?`, lead.telefone, op.id);
  run(`UPDATE leads SET origem='Carta RUAH (captação)', corretor_id=coalesce(?,corretor_id) WHERE id=?`, op.corretor_id, lead.id);
  run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', lead.id, 'sistema', `Respondeu à carta de captação OP-${String(op.id).padStart(4, '0')}. É um PROPRIETÁRIO, não comprador.`);
}

async function recebida({ telefone, nome, texto, wa_id }) {
  const lead = leadPorTelefone(telefone, nome);
  if (wa_id && one('SELECT id FROM mensagens WHERE wa_id=?', wa_id)) return lead; // já processada
  run('INSERT INTO mensagens(lead_id,telefone,direcao,texto,status,wa_id,autor) VALUES(?,?,?,?,?,?,?)', lead.id, normTel(telefone), 'entrada', texto, 'recebida', wa_id || null, nome || 'Cliente');
  run(`UPDATE leads SET ultimo_contato=datetime('now','localtime') WHERE id=?`, lead.id);
  vinculaCarta(lead, texto);
  if (lead.nao_contatar) return lead;
  if (/^\s*(parar|pare|sair|stop|descadastrar)\s*$/i.test(texto)) {
    run('UPDATE leads SET nao_contatar=1 WHERE id=?', lead.id);
    run('INSERT INTO interacoes(lead_id,tipo,texto) VALUES(?,?,?)', lead.id, 'sistema', 'Cliente pediu para não receber mensagens. Incluído na lista não contatar.');
    // Se veio de uma carta de captação, o endereço também sai da lista de abordagem.
    for (const op of all("SELECT id FROM oportunidades WHERE (titular_telefone=? OR telefone_anuncio=?) AND status!='descartada'", lead.telefone, lead.telefone)) {
      run("UPDATE oportunidades SET status='descartada', motivo_descarte='nao_contatar' WHERE id=?", op.id);
      run('INSERT INTO oportunidade_eventos(oportunidade_id,etapa,texto) VALUES(?,?,?)', op.id, 'sistema', 'Proprietário enviou PARAR no WhatsApp: endereço incluído na lista não contatar.');
    }
    return lead;
  }
  if (cfg.IA_MODO !== 'desligado') gerarSugestao(lead.id).catch(() => {});
  return lead;
}

async function gerarSugestao(leadId) {
  const st = await ia.disponivel();
  if (!st.ok) return null;
  const texto = await ia.sugerirResposta(leadId);
  if (!texto) return null;
  const lead = one('SELECT * FROM leads WHERE id=?', leadId);
  run(`DELETE FROM mensagens WHERE lead_id=? AND direcao='sugestao'`, leadId);
  if (cfg.IA_MODO === 'automatico') {
    const env = await enviarTexto(lead.telefone, texto);
    run('INSERT INTO mensagens(lead_id,telefone,direcao,texto,status,wa_id,autor) VALUES(?,?,?,?,?,?,?)', leadId, lead.telefone, 'saida', texto, env.status, env.wa_id, 'IA RUAH');
  } else {
    run('INSERT INTO mensagens(lead_id,telefone,direcao,texto,status,autor) VALUES(?,?,?,?,?,?)', leadId, lead.telefone, 'sugestao', texto, 'aguardando aprovação', 'IA RUAH');
  }
  return texto;
}

function processaWebhook(payload) {
  const tarefas = [];
  for (const e of payload.entry || []) for (const ch of e.changes || []) {
    const v = ch.value || {};
    const nomes = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile && c.profile.name]));
    for (const m of v.messages || []) {
      const texto = m.type === 'text' ? m.text.body : `[${m.type} recebido — abra no celular da RUAH]`;
      tarefas.push(recebida({ telefone: m.from, nome: nomes[m.from], texto, wa_id: m.id }));
    }
    for (const s of v.statuses || []) run('UPDATE mensagens SET status=? WHERE wa_id=?', s.status, s.id);
  }
  return Promise.allSettled(tarefas);
}

module.exports = { modo, normTel, assinaturaValida, enviarTexto, recebida, gerarSugestao, processaWebhook };
