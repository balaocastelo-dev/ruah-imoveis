// Teste do portal: banco temporário com um imóvel à venda e fotos, um ramo de
// conteúdo falso num servidor local, e as regras de "no ar", a régua contra a
// ficha ao vivo, as páginas públicas e o formulário que vira lead no CRM.
//   node test/portal.js
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-portal-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.SECRET_KEY = process.env.SECRET_KEY || 'x'.repeat(48);
process.env.IA_MODO = 'desligado';
delete process.env.DATABASE_URL;

const cfg = require('../src/config');
const { run, one, all } = require('../src/db');
const { lerPagina } = require('../src/portal/validar');
const { avaliarPagina } = require('../src/portal/regua');

// ---- o imóvel à venda, com 7 fotos (ids 9101..9107) e um rascunho sem foto
const PASTA_FOTOS = path.join(cfg.DATA_DIR, 'teste-portal');
fs.mkdirSync(PASTA_FOTOS, { recursive: true });
const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAD/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwA3/9k=', 'base64');
const imId = Number(run(`INSERT INTO imoveis(codigo,tipo,status,logradouro,numero,bairro,cidade,uf,quartos,suites,vagas,area_util,area_total,valor,valor_condominio,iptu,descricao)
  VALUES('CA9001','Casa em condomínio','publicado','Rua Secreta','77','Jardim Exemplo','Campinas','SP',3,3,2,240,450,1890000,950,4800,'Casa térrea com piscina.')`).lastInsertRowid);
for (let k = 1; k <= 7; k += 1) {
  fs.writeFileSync(path.join(PASTA_FOTOS, `f${k}.jpg`), jpg);
  run('INSERT INTO arquivos(id,imovel_id,categoria,nome,mime,tamanho,caminho_local) VALUES(?,?,?,?,?,?,?)', 9100 + k, imId, 'Fotos', `f${k}.jpg`, 'image/jpeg', jpg.length, `teste-portal/f${k}.jpg`);
}
run(`INSERT INTO imoveis(codigo,tipo,status,bairro,cidade) VALUES('AP9002','Apartamento','captacao','Cambuí','Campinas')`);

const modelo = JSON.parse(fs.readFileSync(path.join(__dirname, 'portal-exemplo.json'), 'utf8'));
const ficha = () => {
  const d = require('../src/portal/dados');
  return d.fichaParaRegua(d.imovelAVenda('CA9001'));
};

let pagina = { ...modelo, versao: 'qualquer', publicadoEm: new Date(Date.now() - 3600e3).toISOString() };
const indice = () => ({ paginas: !pagina ? [] : [{ codigo: pagina.codigo, slug: pagina.slug, titulo: pagina.titulo, resumo: pagina.resumo, capa: pagina.capa, versao: pagina.versao, publicadoEm: pagina.publicadoEm }] });

const ramo = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const corpo = p === '/indice.json' ? indice() : p === '/paginas/CA9001.json' && pagina ? pagina : null;
  if (!corpo) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(corpo));
}).listen(0, async () => {
  process.env.PORTAL_CONTEUDO_URL = `http://127.0.0.1:${ramo.address().port}`;
  const app = require('../server');
  const fonte = require('../src/portal/fonte');
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${srv.address().port}`;
  const get = async (p) => { const r = await fetch(url + p, { redirect: 'manual' }); return { s: r.status, t: await r.text(), h: r.headers }; };
  const post = async (p, b) => { const r = await fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
  try {
    // ---- régua
    const lido = lerPagina(modelo);
    assert.ok(lido.ok, JSON.stringify(lido.erros));
    const av = avaliarPagina(lido.valor, ficha(), { modo: 'publicar' });
    assert.ok(av.aprovado, av.erros.join('\n')); console.log('ok · régua aprova o modelo contra a ficha', av.medidas.palavras, 'palavras');
    const mentira = { ...lido.valor, blocos: [...lido.valor.blocos, { tipo: 'paragrafo', texto: 'São 4 suítes, 300 m² e preço de R$ 1.500.000, imperdível. Rua Secreta nº 77.' }] };
    const av2 = avaliarPagina(mentira, ficha(), { modo: 'publicar' });
    for (const k of [/4 suítes/, /300 m²/, /reais/, /urgência/, /número do endereço/]) assert.ok(av2.erros.some((e) => k.test(e)), `régua deveria barrar ${k}`);
    console.log('ok · régua barra número que a ficha não tem, preço, urgência e endereço');
    const semFoto = { ...lido.valor, galeria: lido.valor.galeria.slice(1) };
    assert.ok(avaliarPagina(semFoto, ficha(), { modo: 'publicar' }).erros.some((e) => /TODAS as fotos/.test(e)));
    assert.ok(avaliarPagina({ ...lido.valor, capa: { foto: 1, alt: 'foto de outro imóvel qualquer' } }, ficha(), { modo: 'publicar' }).erros.some((e) => /não são deste imóvel/.test(e)));
    console.log('ok · régua exige todas as fotos na galeria e só fotos do próprio imóvel');

    // ---- páginas públicas
    const vit = await get('/imoveis');
    assert.equal(vit.s, 200); assert.ok(vit.t.includes(modelo.titulo.slice(0, 30)));
    assert.ok(!vit.t.includes('AP9002'), 'imóvel em captação fica fora');
    assert.ok(!vit.t.includes('Rua Secreta'), 'endereço não aparece'); console.log('ok · vitrine mostra o imóvel à venda, sem endereço; captação fica fora');
    assert.equal((await get('/imoveis?tipo=terreno')).t.includes(modelo.titulo.slice(0, 30)), false);
    assert.ok((await get('/imoveis?q=jardim%20exemplo')).t.includes(modelo.titulo.slice(0, 30))); console.log('ok · filtros e busca');

    const pg = await get(`/imoveis/${modelo.slug}`);
    assert.equal(pg.s, 200);
    assert.ok(pg.t.includes('<h1>') && pg.t.includes('RealEstateListing') && pg.t.includes('FAQPage') && pg.t.includes('og:image'));
    assert.ok(pg.t.includes('R$ 1.890.000'), 'valor ao vivo da ficha');
    assert.ok(!pg.t.includes('Rua Secreta') && !pg.t.includes('"77"'), 'sem endereço');
    assert.match(pg.h.get('content-security-policy'), /script-src 'self'/); console.log('ok · página do imóvel: texto no HTML, JSON-LD, valor da ficha e sem endereço');
    assert.equal((await get('/imoveis/CA9001')).h.get('location'), `/imoveis/${modelo.slug}`); console.log('ok · /imoveis/CÓDIGO leva à página');
    assert.equal((await get('/imoveis/casa-que-nao-existe-ca0000')).s, 404);

    const foto = await get('/imoveis/foto/9101');
    assert.equal(foto.s, 200); assert.match(foto.h.get('cache-control'), /immutable/);
    run("UPDATE imoveis SET status='suspenso' WHERE id=?", imId);
    assert.equal((await get('/imoveis/foto/9101')).s, 404); console.log('ok · foto só de imóvel à venda');
    fonte.limparCache();
    assert.equal((await get(`/imoveis/${modelo.slug}`)).s, 404); console.log('ok · imóvel suspenso sai do portal');
    run("UPDATE imoveis SET status='publicado' WHERE id=?", imId);

    // ---- a ficha muda e o texto passa a mentir: sai do ar até ser reescrito
    run('UPDATE imoveis SET suites=2 WHERE id=?', imId);
    fonte.limparCache();
    assert.equal((await get(`/imoveis/${modelo.slug}`)).s, 404);
    const sit = (await fonte.situacao()).find((s) => s.codigo === 'CA9001');
    assert.equal(sit.estado, 'reprovada'); console.log('ok · ficha mudou e contradiz o texto → página sai do ar e entra na fila');
    run('UPDATE imoveis SET suites=3 WHERE id=?', imId);
    fonte.limparCache();
    const dj = JSON.parse((await get('/imoveis/dados.json')).t);
    const d = dj.imoveis.find((i) => i.codigo === 'CA9001');
    assert.equal(d.pagina.estado, 'desatualizada'); assert.equal(d.fotos.length, 7); assert.ok(!('logradouro' in d) && !('valor' in d));
    assert.equal(dj.imoveis.length, 1); console.log('ok · dados.json para a rotina: ficha, fotos e estado (versão antiga = desatualizada)');

    // ---- sem página, não aparece
    const salvo = pagina; pagina = null; fonte.limparCache();
    assert.ok(!(await get('/imoveis')).t.includes(modelo.titulo.slice(0, 30))); console.log('ok · sem página aprovada, o imóvel não aparece');
    pagina = { ...salvo, versao: d.versao }; fonte.limparCache();

    // ---- formulário → lead no CRM
    assert.equal((await post('/api/publico/portal/interesse', { codigo: 'CA9001', nome: 'Ana', telefone: '123', aceite: true })).s, 400);
    assert.equal((await post('/api/publico/portal/interesse', { codigo: 'CA9001', nome: 'Ana', telefone: '(19) 99876-5432' })).s, 400); console.log('ok · telefone e aceite obrigatórios');
    const r1 = await post('/api/publico/portal/interesse', { codigo: 'CA9001', nome: 'Ana Compradora', telefone: '(19) 99876-5432', email: 'ana@exemplo.com', mensagem: 'Quero saber mais', visita: true, dia: '2026-11-03', periodo: 'Manhã', aceite: true });
    assert.equal(r1.s, 200, JSON.stringify(r1.j));
    const lead = one("SELECT * FROM leads WHERE telefone='5519998765432'");
    assert.ok(lead && lead.origem === 'Portal RUAH' && lead.etapa === 'visita' && lead.temperatura === 'quente');
    const it = all('SELECT * FROM interacoes WHERE lead_id=?', lead.id);
    assert.ok(it.some((i) => /VISITA/.test(i.texto) && /CA9001/.test(i.texto) && /03\/11\/2026/.test(i.texto))); console.log('ok · "agendar visita" vira lead quente no CRM com o imóvel e a data');
    await post('/api/publico/portal/interesse', { codigo: 'CA9001', nome: 'Ana C.', telefone: '19998765432', aceite: true });
    assert.equal(all("SELECT id FROM leads WHERE telefone='5519998765432'").length, 1); console.log('ok · mesmo telefone não duplica o lead');
    const robo = await post('/api/publico/portal/interesse', { codigo: 'CA9001', nome: 'Robo', telefone: '19912345678', aceite: true, empresa: 'spam' });
    assert.equal(robo.s, 200); assert.equal(one("SELECT id FROM leads WHERE nome='Robo'"), undefined); console.log('ok · armadilha de robô');
    assert.equal((await get('/api/portal')).s, 401); console.log('ok · /api/portal pede login');

    const rb = await get('/robots.txt'); assert.ok(/Allow: \/imoveis/.test(rb.t));
    const sm = await get('/sitemap.xml'); assert.ok(sm.t.includes(`/imoveis/${modelo.slug}`)); console.log('ok · robots e sitemap incluem o portal');
    console.log('\nPortal OK');
    fs.rmSync(PASTA_FOTOS, { recursive: true, force: true });
    process.exit(0);
  } catch (e) { console.error('FALHOU', e.stack || e.message); fs.rmSync(PASTA_FOTOS, { recursive: true, force: true }); process.exit(1); }
});
