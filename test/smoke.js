// Teste de fumaça da API: sobe o servidor com banco temporário e percorre os fluxos principais.
const os = require('os'), path = require('path'), fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
const app = require('../server');
const assert = require('assert');

(async () => {
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const req = async (m, url, body, ck = cookie) => {
    const r = await fetch(base + url, { method: m, headers: { 'Content-Type': 'application/json', cookie: ck }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc && ck === cookie) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { s: r.status, j };
  };
  const ok = (r, msg) => { if (r.s >= 400) { console.error('FALHOU', msg, r.s, r.j); process.exit(1); } console.log('ok ·', msg); return r.j; };

  assert.equal((await req('GET', '/api/me')).s, 401); console.log('ok · sem login bloqueia');
  assert.equal((await req('GET', '/api/setup')).j.precisa, true);
  assert.equal((await req('POST', '/api/setup', { nome: 'Thiago', email: 'a@b.com', senha: 'fraca' })).s, 400); console.log('ok · senha fraca recusada');
  const st = ok(await req('POST', '/api/setup', { nome: 'Thiago Adm', email: 'adm@ruah.com', senha: 'Teste1234', exemplo: true }), 'setup com exemplo');
  assert.equal(st.exemplo.corretores.length, 2);
  assert.equal((await req('POST', '/api/setup', { nome: 'X', email: 'x@x.com', senha: 'Teste1234' })).s, 409); console.log('ok · setup não repete');
  ok(await req('GET', '/api/me'), 'sessão adm');
  const p = ok(await req('GET', '/api/painel'), 'painel'); assert.ok(p.kpis.imoveis >= 3);

  const novo = ok(await req('POST', '/api/imoveis', { tipo: 'Apartamento', cep: '13087000', logradouro: 'Rua Exemplo das Antilhas', numero: '200', unidade: '142B', bairro: 'Mansões Santo Antônio',
    condominio_nome: 'Rossi Antilhas (Exemplo)', quartos: 4, vagas: 3, area_util: 181, valor: '2.300.000', proprietario: { nome: 'Maria Teste Silva', cpf: '111.444.777-35', telefone: '19 98888-7777' } }), 'cria imóvel');
  assert.equal(novo.codigo, 'AP0003'); assert.ok(novo.compradores.length >= 1, 'match com compradores');
  assert.equal((await req('POST', '/api/imoveis', { tipo: 'Casa', proprietario: { nome: 'X', cpf: '123' } })).s, 400); console.log('ok · CPF inválido recusado');
  const end = ok(await req('GET', '/api/imoveis/endereco?cep=13087000&numero=200'), 'pesquisa endereço');
  assert.equal(end.campos.condominio_nome, 'Rossi Antilhas (Exemplo)'); console.log('   condomínio reconhecido pelo endereço:', end.campos.condominio_nome, '| avisos:', end.avisos.length);
  const im = ok(await req('GET', `/api/imoveis/${novo.id}`), 'ficha'); assert.equal(im.proprietario.cpf, '111.444.777-35');

  // arquivo
  const fd = new FormData(); fd.append('categoria', 'Matrícula e certidões'); fd.append('arquivos', new Blob(['%PDF-1.4 teste'], { type: 'application/pdf' }), 'matricula.pdf');
  const up = await fetch(`${base}/api/imoveis/${novo.id}/arquivos`, { method: 'POST', headers: { cookie }, body: fd }); assert.equal(up.status, 200); console.log('ok · upload local (Drive desconectado)');
  const arqs = ok(await req('GET', `/api/imoveis/${novo.id}/arquivos`), 'lista arquivos'); assert.equal(arqs.arquivos.length, 1);
  const dl = await fetch(`${base}/api/arquivos/${arqs.arquivos[0].id}`, { headers: { cookie } }); assert.equal(dl.status, 200); console.log('ok · download com permissão');

  // link interno
  const lk = ok(await req('POST', `/api/imoveis/${novo.id}/links`, { dias: 7 }), 'gera link interno');
  const tok = lk.url.split('/v/')[1];
  const pub = ok(await req('GET', `/api/publico/imovel/${tok}`, null, ''), 'abre link sem login'); assert.equal(pub.endereco, null); assert.ok(!('proprietario' in pub));
  const lks = ok(await req('GET', `/api/imoveis/${novo.id}/links`), 'acessos'); assert.equal(lks[0].acessos, 1);

  // autorização + assinatura
  const au = ok(await req('POST', `/api/imoveis/${novo.id}/autorizacao`, { prazo_dias: 180, comissao_pct: 6, exclusivo: true, matricula: '12.345' }), 'gera autorização');
  const at = au.url.split('/assinar/')[1];
  ok(await req('GET', `/api/publico/assinatura/${at}`, null, ''), 'abre assinatura');
  assert.equal((await req('POST', `/api/publico/assinatura/${at}`, { nome: 'Maria Teste Silva', cpf: '529.982.247-25', aceite: true, assinatura_png: 'data:image/png;base64,' + 'A'.repeat(2000) }, '')).s, 400); console.log('ok · CPF diferente do dono recusado');
  const png = require('zlib'); // assinatura PNG válida mínima
  const sig = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'assinatura-teste.png')).toString('base64');
  const as = ok(await req('POST', `/api/publico/assinatura/${at}`, { nome: 'Maria Teste Silva', cpf: '111.444.777-35', aceite: true, assinatura_png: sig }, ''), 'assina');
  assert.equal((await req('POST', `/api/publico/assinatura/${at}`, { nome: 'Maria Teste Silva', cpf: '111.444.777-35', aceite: true, assinatura_png: sig }, '')).s, 409); console.log('ok · não assina duas vezes');
  const im2 = ok(await req('GET', `/api/imoveis/${novo.id}`), 'status após assinatura'); assert.equal(im2.status, 'off_market'); assert.equal(im2.exclusivo, 1);
  const arqs2 = ok(await req('GET', `/api/imoveis/${novo.id}/arquivos`), 'PDF salvo'); const pdf = arqs2.arquivos.find((a) => a.categoria === 'Autorização de venda'); assert.ok(pdf);
  const pdfr = await fetch(`${base}/api/arquivos/${pdf.id}`, { headers: { cookie } }); const pb = Buffer.from(await pdfr.arrayBuffer()); assert.equal(pb.slice(0, 4).toString(), '%PDF');
  fs.writeFileSync(path.join(tmp, 'autorizacao.pdf'), pb); console.log('   PDF:', path.join(tmp, 'autorizacao.pdf'), pb.length, 'bytes');

  // CRM
  const leads = ok(await req('GET', '/api/leads'), 'lista leads'); assert.ok(leads.length >= 4);
  const nl = ok(await req('POST', '/api/leads', { nome: 'Cliente Teste', telefone: '(19) 97777-1111', valor_max: 2500000, quartos_min: 4, tipo_desejado: 'Apartamento' }), 'cria lead');
  const ld = ok(await req('GET', `/api/leads/${nl.id}`), 'detalhe lead'); assert.ok(ld.imoveis.length >= 1); console.log('   imóveis que combinam:', ld.imoveis.map((i) => i.codigo + ' ' + i.score + '%').join(', '));
  ok(await req('PATCH', `/api/leads/${nl.id}/etapa`, { etapa: 'qualificado' }), 'muda etapa');
  ok(await req('POST', '/api/visitas', { lead_id: nl.id, imovel_id: novo.id, data_hora: '2026-11-03T10:00' }), 'agenda visita');

  // WhatsApp simulado
  const sim = ok(await req('POST', '/api/whats/simular', { telefone: '19966665555', nome: 'Novo Whats', texto: 'Oi, tem apto de 4 quartos?' }), 'mensagem simulada cria lead');
  ok(await req('POST', `/api/whats/${sim.lead_id}/enviar`, { texto: 'Olá! Temos sim.' }), 'responde (simulado)');
  ok(await req('POST', '/api/whats/simular', { telefone: '19966665555', texto: 'parar' }), 'pede parar');
  assert.equal((await req('POST', `/api/whats/${sim.lead_id}/enviar`, { texto: 'oi' })).s, 400); console.log('ok · lista não contatar respeitada');
  // webhook sem assinatura
  const wh = await fetch(`${base}/webhook/whatsapp`, { method: 'POST', body: '{}' }); assert.equal(wh.status, 401); console.log('ok · webhook sem assinatura recusado');

  // permissões do corretor
  const cr = st.exemplo.corretores[1]; let ck2 = '';
  const lg = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: cr.email, senha: cr.senha }) });
  ck2 = lg.headers.get('set-cookie').split(';')[0];
  const minhas = await (await fetch(base + '/api/imoveis', { headers: { cookie: ck2 } })).json();
  assert.ok(minhas.every((i) => i.corretor_nome === cr.nome)); console.log('ok · corretor vê só os seus imóveis:', minhas.length);
  assert.equal((await fetch(`${base}/api/imoveis/${novo.id}`, { headers: { cookie: ck2 } })).status, 403); console.log('ok · imóvel de outro corretor bloqueado');
  assert.equal((await fetch(`${base}/api/usuarios`, { method: 'POST', headers: { cookie: ck2, 'Content-Type': 'application/json' }, body: '{}' })).status, 403); console.log('ok · corretor não cria usuários');
  // CSRF
  assert.equal((await fetch(base + '/api/leads', { method: 'POST', headers: { cookie, Origin: 'https://site-malicioso.com', 'Content-Type': 'application/json' }, body: '{"nome":"x"}' })).status, 403); console.log('ok · outra origem bloqueada');
  // login errado bloqueia após 5
  for (let i = 0; i < 5; i++) await req('POST', '/api/login', { email: 'adm@ruah.com', senha: 'errada' }, 'x=1');
  assert.equal((await req('POST', '/api/login', { email: 'adm@ruah.com', senha: 'Teste1234' }, 'x=1')).s, 429); console.log('ok · bloqueio após 5 senhas erradas');

  console.log('\nTODOS OS TESTES PASSARAM');
  srv.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
