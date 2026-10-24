// Teste do radar de captação: cascata grátis → aprovação → pago → captação, duplicados e não contatar.
const os = require('os'), path = require('path'), fs = require('fs'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-radar-'));
process.env.RUAH_DB = path.join(tmp, 't.db'); process.env.SECRET_KEY = 'y'.repeat(48); process.env.IA_MODO = 'desligado'; process.env.WHATSAPP_RUAH = '19999998888';
const app = require('../server');
(async () => {
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  const jar = {};
  const req = async (quem, m, url, body) => {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[quem] || '' }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) jar[quem] = sc.split(';')[0];
    const ct = r.headers.get('content-type') || ''; const j = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { s: r.status, j };
  };
  const ok = (r, msg) => { if (r.s >= 400) { console.error('FALHOU', msg, r.s, r.j); process.exit(1); } console.log('ok ·', msg); return r.j; };
  const st = ok(await req('adm', 'POST', '/api/setup', { nome: 'Gestor', email: 'g@r.com', senha: 'Teste1234', exemplo: true }), 'setup');
  const cr = st.exemplo.corretores[0];
  ok(await req('cor', 'POST', '/api/login', { email: cr.email, senha: cr.senha }), 'login corretor');

  const o1 = ok(await req('cor', 'POST', '/api/radar', { portal: 'ZAP Imóveis', link: 'https://zap/1', titulo: 'Apto 4q 175m²', tipo: 'Apartamento', anunciante_tipo: 'particular', anunciante_nome: 'Sr. Dono',
    telefone_anuncio: '(19) 98111-2222', valor: '2.190.000', valor_anterior: '2.330.000', publicado_em: new Date().toISOString().slice(0, 10), logradouro: 'Rua das Antilhas', numero: '200', unidade: '142B', bairro: 'Mansões', quartos: 4 }), 'cadastra oportunidade');
  const d1 = await req('cor', 'POST', '/api/radar', { link: 'https://zap/1', titulo: 'x' }); assert.equal(d1.s, 409); console.log('ok · duplicado por link detectado');
  const d2 = await req('cor', 'POST', '/api/radar', { logradouro: 'rua das antilhas', numero: '200', unidade: '142b' }); assert.equal(d2.s, 409); console.log('ok · duplicado por endereço detectado');
  const lst = ok(await req('cor', 'GET', '/api/radar'), 'lista'); assert.equal(lst[0].prioridade.nivel, 'alta'); console.log('   prioridade:', lst[0].prioridade.motivos.join(', '));

  assert.equal((await req('cor', 'POST', `/api/radar/${o1.id}/aprovacao`, { tipo: 'matricula' })).s, 400); console.log('ok · pago bloqueado antes de tentar o grátis');
  ok(await req('cor', 'POST', `/api/radar/${o1.id}/evento`, { etapa: 'anuncio', resultado: 'nao_atendeu' }), 'registra tentativa no anúncio');
  const pdf = await req('cor', 'GET', `/api/radar/${o1.id}/carta.pdf`); assert.equal(pdf.s, 200); assert.equal(pdf.j.slice(0, 4).toString(), '%PDF');
  fs.writeFileSync(path.join(tmp, 'carta.pdf'), pdf.j); console.log('ok · carta PDF', path.join(tmp, 'carta.pdf'));
  ok(await req('cor', 'POST', `/api/radar/${o1.id}/carta-enviada`, { como: 'Correio', custo: '2,50' }), 'carta enviada');
  assert.equal((await req('cor', 'POST', `/api/radar/${o1.id}/aprovacao`, { tipo: 'biro' })).s, 400); console.log('ok · birô bloqueado antes da matrícula');
  ok(await req('cor', 'POST', `/api/radar/${o1.id}/aprovacao`, { tipo: 'matricula', custo_estimado: '45', justificativa: 'alto padrão' }), 'pede matrícula');
  assert.equal((await req('cor', 'POST', `/api/radar/${o1.id}/matricula`, { titular_nome: 'X' })).s, 403); console.log('ok · matrícula sem aprovação bloqueada');
  assert.equal((await req('cor', 'GET', '/api/radar/aprovacoes')).s, 403); console.log('ok · corretor não aprova');
  const fila = ok(await req('adm', 'GET', '/api/radar/aprovacoes'), 'fila de aprovação'); assert.equal(fila.length, 1);
  ok(await req('adm', 'POST', `/api/radar/aprovacoes/${fila[0].id}/decidir`, { aprovar: true }), 'gestor aprova');
  ok(await req('cor', 'POST', `/api/radar/${o1.id}/matricula`, { titular_nome: 'Maria Titular', matricula_numero: '123.456', cartorio: '2º RI', custo: '45' }), 'registra matrícula');
  const res = ok(await req('adm', 'GET', '/api/radar/resumo'), 'resumo'); assert.equal(res.gasto, 47.5);

  // resposta à carta pelo WhatsApp com a referência
  ok(await req('adm', 'POST', '/api/whats/simular', { telefone: '19977776666', nome: 'Maria', texto: `Olá! Recebi a carta da RUAH (ref. OP-${String(o1.id).padStart(4, '0')}).` }), 'dono responde a carta pelo WhatsApp');
  const det = ok(await req('cor', 'GET', `/api/radar/${o1.id}`), 'detalhe'); assert.ok(det.eventos.some((e) => /respondeu à carta/.test(e.texto))); assert.equal(det.titular_telefone, '5519977776666'); console.log('ok · resposta ligada à oportunidade');

  const cv = ok(await req('cor', 'POST', `/api/radar/${o1.id}/converter`, {}), 'capta (vira imóvel)');
  const im = ok(await req('cor', 'GET', `/api/imoveis/${cv.imovel_id}`), 'imóvel criado'); assert.equal(im.status, 'captacao'); assert.equal(im.proprietario.nome, 'Maria Titular'); console.log('   ', cv.codigo, '· origem:', im.proprietario.origem_dado);

  // imobiliária: não aborda
  const o2 = ok(await req('cor', 'POST', '/api/radar', { titulo: 'Cobertura', anunciante_tipo: 'imobiliaria', logradouro: 'Rua B', numero: '10' }), 'cadastra anúncio de imobiliária');
  assert.equal((await req('cor', 'GET', `/api/radar/${o2.id}/carta.pdf`)).s, 400); console.log('ok · carta bloqueada para imobiliária');
  // não contatar por endereço
  const o3 = ok(await req('cor', 'POST', '/api/radar', { titulo: 'Casa', logradouro: 'Rua C', numero: '5', telefone_anuncio: '19955554444' }), 'cadastra casa');
  ok(await req('cor', 'POST', `/api/radar/${o3.id}/descartar`, { motivo: 'nao_contatar' }), 'descarta: não contatar');
  const o4 = ok(await req('cor', 'POST', '/api/radar', { titulo: 'Mesma casa anunciada de novo', logradouro: 'Rua C', numero: '5', forcar: true, link: 'https://olx/9' }), 'recadastra mesmo endereço');
  const d4 = ok(await req('cor', 'GET', `/api/radar/${o4.id}`), 'detalhe'); assert.ok(d4.bloqueio); console.log('ok · endereço bloqueado:', d4.bloqueio);
  assert.equal((await req('cor', 'POST', `/api/radar/${o4.id}/carta-enviada`, {})).s, 400); console.log('ok · carta bloqueada pela lista não contatar');
  // PARAR por WhatsApp descarta oportunidade
  const o5 = ok(await req('cor', 'POST', '/api/radar', { titulo: 'Apto Cambuí', logradouro: 'Rua D', numero: '7', unidade: '31', telefone_anuncio: '19944443333' }), 'cadastra apto');
  ok(await req('adm', 'POST', '/api/whats/simular', { telefone: '19944443333', texto: 'parar' }), 'anunciante manda PARAR');
  const d5 = ok(await req('cor', 'GET', `/api/radar/${o5.id}`), 'detalhe'); assert.equal(d5.status, 'descartada'); console.log('ok · PARAR descartou a oportunidade');
  // lote
  const o6 = ok(await req('cor', 'POST', '/api/radar', { titulo: 'Apto 2', logradouro: 'Rua E', numero: '9', unidade: '12' }), 'mais uma');
  const lote = await req('cor', 'GET', `/api/radar/cartas.pdf?ids=${o6.id},${o4.id},${o2.id}`); assert.equal(lote.s, 200); fs.writeFileSync(path.join(tmp, 'lote.pdf'), lote.j); console.log('ok · cartas em lote (ignora bloqueadas)');
  console.log('\nRADAR: TODOS OS TESTES PASSARAM'); srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
