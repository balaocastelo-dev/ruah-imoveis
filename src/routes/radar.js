// Radar de captação: oportunidades vindas dos portais e a cascata para chegar ao dono.
// Ordem: 1) contato do anúncio  2) carta com QR code  3) placa/portaria  4) matrícula (paga, com aprovação)  5) birô (pago, com aprovação)
const express = require('express');
const A = require('../auth');
const cfg = require('../config');
const { one, all, run, audit } = require('../db');
const { falha, num, int, txt } = require('../util');
const wa = require('../services/whatsapp');
const carta = require('../services/carta');
const { ajudantes } = require('./imoveis');

const r = express.Router();
const STATUS = ['nova', 'em_contato', 'carta_enviada', 'aguardando_aprovacao', 'captada', 'descartada'];
const MOTIVOS = { nao_contatar: 'Pediu para não ser contatado', imobiliaria: 'Anunciado por imobiliária / exclusivo', vendido: 'Já vendido ou retirado', sem_interesse: 'Dono sem interesse', duplicado: 'Duplicado', outro: 'Outro' };

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function prioridade(op) {
  if (op.anunciante_tipo === 'imobiliaria') return { pontos: 0, nivel: 'nao_abordar', motivos: ['anunciado por imobiliária'] };
  let p = 0; const m = [];
  if (op.anunciante_tipo === 'particular') { p += 40; m.push('particular'); }
  if (op.publicado_em) {
    const dias = (Date.now() - new Date(op.publicado_em + 'T12:00').getTime()) / 864e5;
    if (dias <= 2) { p += 20; m.push('anúncio novo'); } else if (dias <= 7) { p += 10; m.push('anúncio da semana'); }
  }
  if (op.valor_anterior && op.valor && op.valor < op.valor_anterior) { p += 25; m.push(`preço caiu ${Math.round((1 - op.valor / op.valor_anterior) * 100)}%`); }
  if (op.valor >= 1500000) { p += 10; m.push('alto padrão'); }
  if (op.telefone_anuncio) { p += 5; m.push('tem telefone'); }
  return { pontos: p, nivel: p >= 60 ? 'alta' : p >= 35 ? 'media' : 'baixa', motivos: m };
}

// Lista não contatar: telefone marcado em leads/proprietários ou endereço que já pediu para sair.
function bloqueioContato(op) {
  const tels = [op.telefone_anuncio, op.titular_telefone].map((t) => (t ? wa.normTel(t) : null)).filter(Boolean);
  for (const t of tels) {
    if (one('SELECT 1 FROM leads WHERE telefone=? AND nao_contatar=1', t)) return 'Este telefone está na lista não contatar (pediu PARAR no WhatsApp).';
    if (one("SELECT 1 FROM proprietarios WHERE nao_contatar=1 AND replace(replace(replace(replace(telefone,' ',''),'-',''),'(',''),')','') LIKE ?", '%' + t.slice(-9))) return 'Este telefone pertence a um proprietário marcado como não contatar.';
  }
  if (op.logradouro && op.numero) {
    const outro = all("SELECT * FROM oportunidades WHERE id!=? AND motivo_descarte='nao_contatar' AND numero=?", op.id || 0, String(op.numero))
      .find((o) => norm(o.logradouro) === norm(op.logradouro) && norm(o.unidade) === norm(op.unidade));
    if (outro) return `Este endereço pediu para não ser contatado (oportunidade OP-${String(outro.id).padStart(4, '0')}).`;
  }
  return null;
}

function permitida(u, id) {
  const op = one('SELECT * FROM oportunidades WHERE id=?', id);
  if (!op) falha(404, 'Oportunidade não encontrada.');
  if (!A.veTudo(u) && op.corretor_id && op.corretor_id !== u.id) falha(403, 'Esta oportunidade é de outro corretor.');
  return op;
}
const evento = (opId, etapa, texto, autor, custo = 0) => run('INSERT INTO oportunidade_eventos(oportunidade_id,etapa,texto,custo,autor_id) VALUES(?,?,?,?,?)', opId, etapa, txt(texto, 1000), custo || 0, autor ?? null);
const toca = (id, status) => run(`UPDATE oportunidades SET ${status ? 'status=?, ' : ''}atualizado_em=datetime('now','localtime') WHERE id=?`, ...(status ? [status, id] : [id]));

function campos(b) {
  if (b.anunciante_tipo && !['particular', 'imobiliaria', 'desconhecido'].includes(b.anunciante_tipo)) falha(400, 'Tipo de anunciante inválido.');
  return {
    portal: txt(b.portal, 60), link: txt(b.link, 500), titulo: txt(b.titulo, 200), tipo: txt(b.tipo, 40),
    bairro: txt(b.bairro, 80), logradouro: txt(b.logradouro, 150), numero: txt(b.numero, 20), unidade: txt(b.unidade, 40),
    condominio_nome: txt(b.condominio_nome, 120), cidade: txt(b.cidade, 80) || cfg.CIDADE_PADRAO,
    quartos: int(b.quartos), vagas: int(b.vagas), area: num(b.area), valor: num(b.valor), valor_anterior: num(b.valor_anterior),
    anunciante_tipo: b.anunciante_tipo || 'particular', anunciante_nome: txt(b.anunciante_nome, 120),
    telefone_anuncio: b.telefone_anuncio ? wa.normTel(b.telefone_anuncio) : null, publicado_em: txt(b.publicado_em, 10), observacoes: txt(b.observacoes, 2000),
  };
}

function duplicada(c, ignorar = 0) {
  if (c.link) { const d = one('SELECT id FROM oportunidades WHERE link=? AND id!=?', c.link, ignorar); if (d) return d.id; }
  if (c.telefone_anuncio) { const d = one("SELECT id FROM oportunidades WHERE telefone_anuncio=? AND id!=? AND status!='descartada'", c.telefone_anuncio, ignorar); if (d) return d.id; }
  if (c.logradouro && c.numero) {
    const d = all('SELECT id,logradouro,unidade FROM oportunidades WHERE numero=? AND id!=?', c.numero, ignorar).find((o) => norm(o.logradouro) === norm(c.logradouro) && norm(o.unidade) === norm(c.unidade));
    if (d) return d.id;
  }
  return null;
}

const comExtras = (op) => ({ ...op, ref: carta.ref(op), prioridade: prioridade(op), bloqueio: bloqueioContato(op) });

// ---------- radar automático (alertas por e-mail) ----------
const alertas = require('../services/alertas');
const portais = require('../services/portais');
// Status do radar automático: e-mail + monitor direto. O vigia junta os problemas dos dois.
r.get('/radar/alertas', (req, res) => {
  const st = alertas.status(); const ps = portais.status();
  if (ps.ligado) {
    if (ps.ultima && ps.ultima.erro) st.saude.problemas.push({ tipo: 'portais', texto: `Monitor direto dos portais: ${ps.ultima.erro}` });
    if (ps.parado) st.saude.problemas.push({ tipo: 'portais', texto: 'O monitor direto dos portais parou de rodar. O sistema está aberto?' });
    st.saude.ok = !st.saude.problemas.length;
  }
  res.json({ ...st, portais: ps });
});
r.post('/radar/portais/ler', A.exigePerfil('adm', 'gestor'), async (req, res) => {
  const { encontrados, ...r0 } = await portais.ler();
  audit(req.usuario.id, 'radar_ler_portais', 'manual');
  res.json(r0);
});
r.post('/radar/alertas/ler', A.exigePerfil('adm', 'gestor'), async (req, res) => {
  if (!alertas.configurado()) falha(400, 'Configure o e-mail do radar no .env (RADAR_EMAIL e RADAR_EMAIL_SENHA).');
  const dias = Math.min(30, parseInt(req.body?.dias, 10) || 0) || null;
  const { encontrados, ...r0 } = await alertas.ler({ dias });
  audit(req.usuario.id, 'radar_ler_alertas', dias ? `últimos ${dias} dias` : 'manual');
  res.json(r0);
});

// ---------- listagem e resumo ----------
r.get('/radar', (req, res) => {
  const u = req.usuario; const p = []; let w = 'WHERE 1=1';
  if (!A.veTudo(u)) { w += ' AND (o.corretor_id=? OR o.corretor_id IS NULL)'; p.push(u.id); }
  if (req.query.status) { w += ' AND o.status=?'; p.push(req.query.status); } else w += " AND o.status NOT IN ('captada','descartada')";
  if (req.query.q) { w += ' AND (o.titulo LIKE ? OR o.bairro LIKE ? OR o.condominio_nome LIKE ? OR o.logradouro LIKE ?)'; const q = `%${req.query.q}%`; p.push(q, q, q, q); }
  const l = all(`SELECT o.*, us.nome corretor_nome, (SELECT max(em) FROM oportunidade_eventos e WHERE e.oportunidade_id=o.id) ultimo_evento
     FROM oportunidades o LEFT JOIN usuarios us ON us.id=o.corretor_id ${w} ORDER BY o.atualizado_em DESC LIMIT 500`, ...p).map(comExtras);
  l.sort((a, b) => b.prioridade.pontos - a.prioridade.pontos);
  res.json(l);
});

r.get('/radar/resumo', (req, res) => {
  const porStatus = Object.fromEntries(all('SELECT status, count(*) n FROM oportunidades GROUP BY status').map((x) => [x.status, x.n]));
  const gasto = one('SELECT coalesce(sum(custo),0) v FROM oportunidade_eventos').v;
  const captadas = porStatus.captada || 0;
  const porEtapa = all("SELECT etapa, count(DISTINCT o.id) n FROM oportunidades o JOIN oportunidade_eventos e ON e.oportunidade_id=o.id AND e.etapa=(SELECT etapa FROM oportunidade_eventos x WHERE x.oportunidade_id=o.id AND x.etapa IN ('anuncio','carta','local','matricula','biro') ORDER BY x.id DESC LIMIT 1) WHERE o.status='captada' GROUP BY etapa");
  res.json({ porStatus, gasto, captadas, custoPorCaptacao: captadas ? gasto / captadas : null, aprovacoesPendentes: one("SELECT count(*) n FROM aprovacoes WHERE status='pendente'").n, captadasPorEtapa: porEtapa });
});

r.get('/radar/aprovacoes', A.exigePerfil('adm', 'gestor'), (req, res) => {
  res.json(all(`SELECT a.*, o.titulo, o.bairro, o.condominio_nome, o.logradouro, o.numero, o.unidade, o.valor, us.nome solicitante FROM aprovacoes a
     JOIN oportunidades o ON o.id=a.oportunidade_id LEFT JOIN usuarios us ON us.id=a.solicitado_por WHERE a.status='pendente' ORDER BY a.id`)
    .map((a) => ({ ...a, ref: carta.ref({ id: a.oportunidade_id }) })));
});

// Cartas em lote (antes da rota /radar/:id)
r.get('/radar/cartas.pdf', async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 200);
  if (!ids.length) falha(400, 'Escolha ao menos uma oportunidade.');
  const itens = [];
  for (const id of ids) {
    const op = permitida(req.usuario, id);
    if (bloqueioContato(op) || op.anunciante_tipo === 'imobiliaria' || !op.logradouro) continue;
    itens.push({ op, corretor: one('SELECT nome,telefone FROM usuarios WHERE id=?', op.corretor_id || req.usuario.id) });
  }
  if (!itens.length) falha(400, 'Nenhuma das oportunidades escolhidas pode receber carta (sem endereço, de imobiliária ou na lista não contatar).');
  const pdf = await carta.pdfCartas(itens);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="cartas-ruah-${new Date().toISOString().slice(0, 10)}.pdf"`);
  res.end(pdf);
});

// ---------- cadastro ----------
r.post('/radar', (req, res) => {
  const c = campos(req.body || {});
  if (!c.titulo && !c.logradouro && !c.link) falha(400, 'Informe ao menos o link, o título do anúncio ou o endereço.');
  const dup = duplicada(c);
  if (dup && !req.body.forcar) return res.status(409).json({ erro: `Parece a mesma oportunidade já cadastrada (OP-${String(dup).padStart(4, '0')}).`, duplicada: dup });
  c.corretor_id = A.veTudo(req.usuario) ? (int(req.body.corretor_id) || null) : req.usuario.id;
  c.criado_por = req.usuario.id;
  const cols = Object.keys(c);
  const id = Number(run(`INSERT INTO oportunidades(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, ...cols.map((k) => c[k])).lastInsertRowid);
  evento(id, 'sistema', `Cadastrada por ${req.usuario.nome}${c.portal ? ' a partir de ' + c.portal : ''}.`, req.usuario.id);
  if (c.anunciante_tipo === 'imobiliaria') evento(id, 'sistema', 'Anunciado por imobiliária: não abordar o dono (provável exclusividade).');
  res.json({ id });
});

r.get('/radar/:id', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  const telCarta = cfg.WHATSAPP_RUAH || (op.corretor_id && (one('SELECT telefone FROM usuarios WHERE id=?', op.corretor_id) || {}).telefone);
  res.json({
    ...comExtras(op), motivos_descarte: MOTIVOS,
    corretor_nome: op.corretor_id ? one('SELECT nome FROM usuarios WHERE id=?', op.corretor_id).nome : null,
    eventos: all('SELECT e.*, u.nome autor FROM oportunidade_eventos e LEFT JOIN usuarios u ON u.id=e.autor_id WHERE oportunidade_id=? ORDER BY e.id DESC', op.id),
    aprovacoes: all('SELECT a.*, u.nome decisor FROM aprovacoes a LEFT JOIN usuarios u ON u.id=a.decidido_por WHERE oportunidade_id=? ORDER BY a.id DESC', op.id),
    gasto: one('SELECT coalesce(sum(custo),0) v FROM oportunidade_eventos WHERE oportunidade_id=?', op.id).v,
    whatsapp_anuncio: op.telefone_anuncio ? `https://wa.me/${op.telefone_anuncio}?text=${encodeURIComponent(`Olá! Vi o seu anúncio${op.portal ? ' no ' + op.portal : ''}${op.condominio_nome ? ' do ' + op.condominio_nome : ''}. Sou da ${cfg.EMPRESA}. O imóvel ainda está à venda?`)}` : null,
    carta_sem_telefone: !telCarta,
    custos_padrao: { matricula: cfg.CUSTO_MATRICULA, biro: cfg.CUSTO_BIRO },
  });
});

r.put('/radar/:id', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  const c = campos({ ...op, ...req.body });
  const dup = duplicada(c, op.id);
  if (dup && !req.body.forcar) return res.status(409).json({ erro: `Ficou igual à OP-${String(dup).padStart(4, '0')}.`, duplicada: dup });
  if (A.veTudo(req.usuario) && req.body.corretor_id !== undefined) c.corretor_id = int(req.body.corretor_id) || null;
  const cols = Object.keys(c);
  run(`UPDATE oportunidades SET ${cols.map((k) => k + '=?').join(',')}, atualizado_em=datetime('now','localtime') WHERE id=?`, ...cols.map((k) => c[k]), op.id);
  res.json({ ok: true });
});

r.post('/radar/:id/assumir', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  if (op.corretor_id && !A.veTudo(req.usuario)) falha(409, 'Já tem corretor responsável.');
  run('UPDATE oportunidades SET corretor_id=? WHERE id=?', req.usuario.id, op.id);
  evento(op.id, 'sistema', `${req.usuario.nome} assumiu a oportunidade.`, req.usuario.id);
  res.json({ ok: true });
});

// ---------- etapas gratuitas ----------
const RESULTADOS = { atendeu_interessado: 'Falou com o dono: tem interesse', atendeu_sem_interesse: 'Falou com o dono: sem interesse', nao_atendeu: 'Não atendeu / sem resposta', nao_e_dono: 'Não é o dono (corretor ou terceiro)', outro: 'Outro' };
r.post('/radar/:id/evento', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  const etapa = req.body.etapa;
  if (!['anuncio', 'carta', 'local', 'nota'].includes(etapa)) falha(400, 'Etapa inválida.');
  if (['anuncio', 'local'].includes(etapa) && bloqueioContato(op)) falha(400, bloqueioContato(op));
  if (etapa === 'anuncio' && op.anunciante_tipo === 'imobiliaria') falha(400, 'Anúncio de imobiliária: não abordamos o dono.');
  const resultado = RESULTADOS[req.body.resultado];
  const texto = [resultado, txt(req.body.texto, 800)].filter(Boolean).join(' — ');
  if (!texto) falha(400, 'Descreva o que aconteceu.');
  evento(op.id, etapa, texto, req.usuario.id);
  if (!op.corretor_id) run('UPDATE oportunidades SET corretor_id=? WHERE id=?', req.usuario.id, op.id);
  if (req.body.resultado === 'nao_e_dono') run("UPDATE oportunidades SET anunciante_tipo='imobiliaria' WHERE id=?", op.id);
  toca(op.id, ['nova'].includes(op.status) && etapa !== 'nota' ? 'em_contato' : null);
  res.json({ ok: true, converter: req.body.resultado === 'atendeu_interessado' });
});

r.get('/radar/:id/carta.pdf', async (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  if (!op.logradouro) falha(400, 'Informe o endereço (rua e número) para gerar a carta.');
  if (bloqueioContato(op)) falha(400, bloqueioContato(op));
  if (op.anunciante_tipo === 'imobiliaria') falha(400, 'Anúncio de imobiliária: não enviamos carta.');
  const pdf = await carta.pdfCartas([{ op, corretor: one('SELECT nome,telefone FROM usuarios WHERE id=?', op.corretor_id || req.usuario.id) }]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="carta-${carta.ref(op)}.pdf"`);
  res.end(pdf);
});
r.post('/radar/:id/carta-enviada', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  if (bloqueioContato(op)) falha(400, bloqueioContato(op));
  run("UPDATE oportunidades SET carta_enviada_em=date('now','localtime'), corretor_id=coalesce(corretor_id,?) WHERE id=?", req.usuario.id, op.id);
  evento(op.id, 'carta', `Carta enviada${req.body.como ? ' (' + txt(req.body.como, 60) + ')' : ''}.`, req.usuario.id, num(req.body.custo) || 0);
  toca(op.id, ['nova', 'em_contato'].includes(op.status) ? 'carta_enviada' : null);
  res.json({ ok: true });
});
r.post('/radar/cartas-enviadas', (req, res) => {
  const ids = (req.body.ids || []).map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 200);
  let n = 0;
  for (const id of ids) {
    const op = permitida(req.usuario, id);
    if (bloqueioContato(op) || op.anunciante_tipo === 'imobiliaria' || !op.logradouro) continue;
    run("UPDATE oportunidades SET carta_enviada_em=date('now','localtime'), corretor_id=coalesce(corretor_id,?) WHERE id=?", req.usuario.id, id);
    evento(id, 'carta', 'Carta enviada (lote).', req.usuario.id);
    toca(id, ['nova', 'em_contato'].includes(op.status) ? 'carta_enviada' : null); n++;
  }
  res.json({ ok: true, marcadas: n });
});

// ---------- etapas pagas: só com aprovação ----------
function podePedir(op, tipo) {
  if (op.anunciante_tipo === 'imobiliaria') return 'Anúncio de imobiliária: não gastamos com esta oportunidade.';
  if (bloqueioContato(op)) return bloqueioContato(op);
  const tentouGratis = one("SELECT 1 FROM oportunidade_eventos WHERE oportunidade_id=? AND etapa IN ('anuncio','carta','local')", op.id);
  if (!tentouGratis) return 'Antes de gastar, tente os caminhos grátis: contato do anúncio, carta ou placa/portaria.';
  if (tipo === 'biro' && !op.titular_nome) return 'O birô só é usado depois da matrícula, para achar o telefone do titular confirmado.';
  if (one("SELECT 1 FROM aprovacoes WHERE oportunidade_id=? AND tipo=? AND status='pendente'", op.id, tipo)) return 'Já existe um pedido aguardando aprovação.';
  return null;
}
r.post('/radar/:id/aprovacao', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  const tipo = req.body.tipo;
  if (!['matricula', 'biro'].includes(tipo)) falha(400, 'Tipo inválido.');
  const motivo = podePedir(op, tipo); if (motivo) falha(400, motivo);
  const custo = num(req.body.custo_estimado) ?? (tipo === 'matricula' ? cfg.CUSTO_MATRICULA : cfg.CUSTO_BIRO);
  run('INSERT INTO aprovacoes(oportunidade_id,tipo,custo_estimado,justificativa,solicitado_por) VALUES(?,?,?,?,?)', op.id, tipo, custo || null, txt(req.body.justificativa, 500), req.usuario.id);
  evento(op.id, tipo, `Pedido de ${tipo === 'matricula' ? 'matrícula' : 'consulta no birô'} enviado para aprovação.`, req.usuario.id);
  toca(op.id, 'aguardando_aprovacao');
  res.json({ ok: true });
});
r.post('/radar/aprovacoes/:aid/decidir', A.exigePerfil('adm', 'gestor'), (req, res) => {
  const a = one("SELECT * FROM aprovacoes WHERE id=? AND status='pendente'", req.params.aid) || falha(404, 'Pedido não encontrado ou já decidido.');
  const aprovar = !!req.body.aprovar;
  run("UPDATE aprovacoes SET status=?, decidido_por=?, decidido_em=datetime('now','localtime'), motivo=? WHERE id=?", aprovar ? 'aprovada' : 'negada', req.usuario.id, txt(req.body.motivo, 300), a.id);
  evento(a.oportunidade_id, a.tipo, `${a.tipo === 'matricula' ? 'Matrícula' : 'Birô'} ${aprovar ? 'aprovado' : 'negado'} por ${req.usuario.nome}${req.body.motivo ? ': ' + req.body.motivo : ''}.`, req.usuario.id);
  const op = one('SELECT * FROM oportunidades WHERE id=?', a.oportunidade_id);
  if (!one("SELECT 1 FROM aprovacoes WHERE oportunidade_id=? AND status='pendente'", op.id)) toca(op.id, op.carta_enviada_em ? 'carta_enviada' : 'em_contato');
  audit(req.usuario.id, aprovar ? 'radar_aprovado' : 'radar_negado', `OP-${op.id} ${a.tipo}`);
  res.json({ ok: true });
});
const aprovada = (opId, tipo) => one("SELECT * FROM aprovacoes WHERE oportunidade_id=? AND tipo=? AND status='aprovada' ORDER BY id DESC", opId, tipo);

r.post('/radar/:id/matricula', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  if (!aprovada(op.id, 'matricula')) falha(403, 'A consulta de matrícula precisa ser aprovada pelo gestor antes.');
  const nome = txt(req.body.titular_nome, 120) || falha(400, 'Informe o nome do titular que consta na matrícula.');
  run('UPDATE oportunidades SET titular_nome=?, matricula_numero=?, cartorio=?, titular_origem=? WHERE id=?', nome, txt(req.body.matricula_numero, 40), txt(req.body.cartorio, 120), 'Matrícula do imóvel (Registro de Imóveis)', op.id);
  evento(op.id, 'matricula', `Matrícula ${req.body.matricula_numero || ''} consultada: titular ${nome}.`, req.usuario.id, num(req.body.custo) || 0);
  toca(op.id);
  res.json({ ok: true });
});
r.post('/radar/:id/biro', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  if (!aprovada(op.id, 'biro')) falha(403, 'A consulta no birô precisa ser aprovada pelo gestor antes.');
  const tel = req.body.titular_telefone ? wa.normTel(req.body.titular_telefone) : falha(400, 'Informe o telefone encontrado.');
  const fonte = txt(req.body.fonte, 60) || 'Birô de dados';
  run('UPDATE oportunidades SET titular_telefone=?, titular_origem=? WHERE id=?', tel, `${fonte} (com aval jurídico), a partir do titular da matrícula`, op.id);
  evento(op.id, 'biro', `Telefone do titular obtido em ${fonte}.`, req.usuario.id, num(req.body.custo) || 0);
  toca(op.id);
  const b = bloqueioContato({ ...op, titular_telefone: tel });
  res.json({ ok: true, aviso: b });
});

// ---------- desfecho ----------
r.post('/radar/:id/descartar', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  if (!MOTIVOS[req.body.motivo]) falha(400, 'Escolha o motivo.');
  run("UPDATE oportunidades SET status='descartada', motivo_descarte=?, atualizado_em=datetime('now','localtime') WHERE id=?", req.body.motivo, op.id);
  evento(op.id, 'sistema', `Descartada: ${MOTIVOS[req.body.motivo]}${req.body.texto ? ' — ' + txt(req.body.texto, 300) : ''}.`, req.usuario.id);
  if (req.body.motivo === 'nao_contatar') {
    for (const t of [op.telefone_anuncio, op.titular_telefone].filter(Boolean)) run('UPDATE leads SET nao_contatar=1 WHERE telefone=?', t);
  }
  res.json({ ok: true });
});
r.post('/radar/:id/reabrir', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  if (op.status !== 'descartada') falha(400, 'Só oportunidades descartadas podem ser reabertas.');
  if (op.motivo_descarte === 'nao_contatar' && !A.veTudo(req.usuario)) falha(403, 'Só o gestor reabre quem pediu para não ser contatado.');
  run("UPDATE oportunidades SET status='em_contato', motivo_descarte=NULL WHERE id=?", op.id);
  evento(op.id, 'sistema', `Reaberta por ${req.usuario.nome}.`, req.usuario.id);
  res.json({ ok: true });
});

r.post('/radar/:id/converter', (req, res) => {
  const op = permitida(req.usuario, req.params.id);
  if (op.imovel_id) falha(409, 'Esta oportunidade já virou imóvel.');
  const tipo = req.body.tipo || op.tipo;
  if (!ajudantes.TIPOS.includes(tipo)) falha(400, 'Escolha o tipo do imóvel antes de captar.');
  const condId = ajudantes.salvarCondominio({ condominio_nome: op.condominio_nome, logradouro: op.logradouro, numero: op.numero, bairro: op.bairro, cidade: op.cidade, uf: cfg.UF_PADRAO });
  const donoNome = op.titular_nome || (op.anunciante_tipo === 'particular' && op.anunciante_nome) || 'Proprietário (confirmar nome)';
  const donoTel = op.titular_telefone || (op.anunciante_tipo === 'particular' ? op.telefone_anuncio : null);
  const origem = op.titular_origem || (op.anunciante_tipo === 'particular' ? `Anúncio do próprio proprietário${op.portal ? ' (' + op.portal + ')' : ''}` : 'Resposta à carta da RUAH');
  const donoId = Number(run('INSERT INTO proprietarios(nome,telefone,origem_dado) VALUES(?,?,?)', donoNome, donoTel, origem).lastInsertRowid);
  const codigo = ajudantes.proximoCodigo(tipo);
  const imId = Number(run(`INSERT INTO imoveis(codigo,tipo,status,logradouro,numero,unidade,bairro,cidade,uf,condominio_id,quartos,vagas,area_util,valor,corretor_id,proprietario_id,descricao)
     VALUES(?,?,'captacao',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, codigo, tipo, op.logradouro, op.numero, op.unidade, op.bairro, op.cidade || cfg.CIDADE_PADRAO, cfg.UF_PADRAO, condId,
    op.quartos, op.vagas, op.area, op.valor, op.corretor_id || req.usuario.id, donoId, `Captado pelo radar (${carta.ref(op)}).${op.link ? ' Anúncio original: ' + op.link : ''}`).lastInsertRowid);
  run("UPDATE oportunidades SET status='captada', imovel_id=?, atualizado_em=datetime('now','localtime') WHERE id=?", imId, op.id);
  evento(op.id, 'sistema', `Captada: virou o imóvel ${codigo}.`, req.usuario.id);
  audit(req.usuario.id, 'radar_captado', `${carta.ref(op)} → ${codigo}`);
  res.json({ imovel_id: imId, codigo });
});

module.exports = r;
