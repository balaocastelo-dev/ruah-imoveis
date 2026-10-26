// Importa os imóveis raspados do site antigo (ruahimobiliaria.com.br) para o Sistema RUAH.
// Lê data/raspagem/imoveis.json e as fotos em data/raspagem/fotos/<ref>/.
// Uso (no PC, com DATABASE_URL no .env para ir direto ao banco online):
//   node scripts/importar-raspagem.js            → importa / atualiza
//   node scripts/importar-raspagem.js --simular  → só mostra o que faria
// Pode rodar de novo: imóvel que já existe (mesmo código) é atualizado e as fotos trocadas pelas do site.
const fs = require('fs');
const path = require('path');
const { one, all, run, audit } = require('../src/db');
const conteudo = require('../src/services/conteudo');

if (!conteudo.PG) { console.error('Configure DATABASE_URL no .env (banco online) antes de importar.'); process.exit(1); }
const PASTA = path.join(__dirname, '..', 'data', 'raspagem');
const SIMULAR = process.argv.includes('--simular');
const EXEMPLO = 'Imóvel de exemplo para testar o sistema';

const PREFIXO = { 'Apartamento': 'AP', 'Cobertura': 'CB', 'Casa': 'CA', 'Casa em condomínio': 'CC', 'Sala comercial': 'SL', 'Loja': 'LJ', 'Galpão': 'GA', 'Terreno': 'TE', 'Chácara': 'CH' };
const TIPO = {
  'Apartamento': 'Apartamento', 'Cobertura': 'Cobertura', 'Casa': 'Casa', 'Sobrado': 'Casa', 'Casa em condomínio': 'Casa em condomínio',
  'Terreno': 'Terreno', 'Terreno em condomínio': 'Terreno', 'Sala comercial': 'Sala comercial', 'Galpão': 'Galpão', 'Chácara': 'Chácara', 'Loja': 'Loja',
};
const PREFIXO_SITE = { AP: 'Apartamento', AD: 'Apartamento', CB: 'Cobertura', CA: 'Casa', SO: 'Casa', CC: 'Casa em condomínio', TE: 'Terreno', SL: 'Sala comercial', GA: 'Galpão', CH: 'Chácara', LJ: 'Loja' };

const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const t = (v, max = 500) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);
const mimeDe = (f) => ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' }[path.extname(f).toLowerCase()] || 'image/jpeg');

function proximoCodigo(tipo) {
  const p = PREFIXO[tipo] || 'IM';
  const r0 = one("SELECT max(CAST(substr(codigo,3) AS INTEGER)) n FROM imoveis WHERE codigo LIKE ?", p + '%');
  return p + String((r0.n || 0) + 1).padStart(4, '0');
}

function tipoDo(d, ref) {
  if (TIPO[d.tipo]) return d.tipo === 'Casa' && d.condominio_nome ? 'Casa em condomínio' : TIPO[d.tipo];
  return PREFIXO_SITE[String(ref || '').slice(0, 2)] || 'Casa';
}

function condominio(d) {
  const nome = t(d.condominio_nome, 120);
  if (!nome || nome.length < 3) return null;
  const ex = one("SELECT id FROM condominios WHERE lower(nome)=lower(?) AND coalesce(cidade,'')=?", nome, d.cidade || 'Campinas');
  if (ex) return ex.id;
  if (SIMULAR) return null;
  return Number(run('INSERT INTO condominios(nome,logradouro,bairro,cidade,uf,lat,lon) VALUES(?,?,?,?,?,?,?)',
    nome, t(d.logradouro, 150), t(d.bairro, 80), d.cidade || 'Campinas', d.uf || 'SP', n(d.lat), n(d.lon)).lastInsertRowid);
}

function descricaoDe(d, ref) {
  let s = String(d.descricao || '').replace(/\r\n/g, '\n').trim();
  const car = (d.caracteristicas || []).filter(Boolean);
  if (car.length) s += `\n\nCaracterísticas: ${car.join(', ')}.`;
  if (d.banheiros) s += `\nBanheiros: ${d.banheiros}.`;
  s += `\n\nAnúncio no site da RUAH (código ${ref}): ${d.url}`;
  return s.trim();
}

const lista = JSON.parse(fs.readFileSync(path.join(PASTA, 'imoveis.json'), 'utf8'));
const adm = one("SELECT id FROM usuarios WHERE perfil='adm' AND ativo=1 AND email NOT LIKE '%@ruah.local' ORDER BY id LIMIT 1");
let novos = 0, atualizados = 0, fotosTot = 0;

for (const d of lista) {
  const ref = String(d.ref_site || '').toUpperCase().replace(/-RUAH$/, '');
  const tipo = tipoDo(d, ref);
  let im = /^[A-Z]{2}\d{4}$/.test(ref) ? one('SELECT * FROM imoveis WHERE codigo=?', ref) : null;
  // imóvel de exemplo do sistema com o mesmo código do site: renomeia o exemplo, o código fica para o imóvel real
  if (im && String(im.descricao || '').includes(EXEMPLO)) {
    if (!SIMULAR) run('UPDATE imoveis SET codigo=? WHERE id=?', 'EX-' + im.codigo, im.id);
    console.log(`  exemplo ${ref} renomeado para EX-${ref}`);
    im = null;
  }
  const codigo = im ? im.codigo : (/^[A-Z]{2}\d{4}$/.test(ref) && !one('SELECT 1 FROM imoveis WHERE codigo=?', ref) ? ref : proximoCodigo(tipo));
  const campos = {
    tipo, status: 'publicado', cep: t(String(d.cep || '').replace(/\D/g, ''), 8), logradouro: t(d.logradouro, 150), numero: t(d.numero, 20),
    bairro: t(d.bairro, 80), cidade: t(d.cidade, 80) || 'Campinas', uf: t(d.uf, 2) || 'SP', lat: n(d.lat), lon: n(d.lon),
    condominio_id: condominio(d), quartos: n(d.quartos), suites: n(d.suites), vagas: n(d.vagas),
    area_util: n(d.area_util), area_total: n(d.area_total), valor: n(d.valor), valor_condominio: n(d.valor_condominio), iptu: n(d.iptu),
    descricao: descricaoDe(d, ref),
  };
  const fotos = (d.fotos || []).map((f) => (typeof f === 'string' ? f : f.arquivo)).filter(Boolean)
    .map((f) => path.join(PASTA, f)).filter((p) => p.startsWith(PASTA) && fs.existsSync(p) && fs.statSync(p).size > 0);

  if (SIMULAR) { console.log(`  ${im ? 'atualiza' : 'novo    '} ${codigo} · ${tipo} · ${campos.bairro || ''} · R$ ${(campos.valor || 0).toLocaleString('pt-BR')} · ${fotos.length} fotos`); continue; }

  let id;
  if (im) {
    id = im.id;
    const cols = Object.keys(campos).filter((k) => !(k === 'status') && !(k === 'condominio_id' && !campos[k]) && !(campos[k] === null && im[k] !== null));
    run(`UPDATE imoveis SET ${cols.map((k) => k + '=?').join(',')}, atualizado_em=datetime('now','localtime') WHERE id=?`, ...cols.map((k) => campos[k]), id);
    atualizados++;
  } else {
    const c = { codigo, ...campos, corretor_id: adm ? adm.id : null };
    const cols = Object.keys(c);
    id = Number(run(`INSERT INTO imoveis(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, ...cols.map((k) => c[k])).lastInsertRowid);
    novos++;
  }

  if (fotos.length) {
    run("DELETE FROM arquivos WHERE imovel_id=? AND categoria='Fotos' AND drive_id IS NULL", id);
    fotos.forEach((p, i) => {
      const buf = fs.readFileSync(p);
      const nome = `${codigo}-foto-${String(i + 1).padStart(2, '0')}${path.extname(p).toLowerCase() || '.jpg'}`;
      const aid = Number(run('INSERT INTO arquivos(imovel_id,categoria,nome,mime,tamanho,caminho_local,enviado_por) VALUES(?,?,?,?,?,?,?)',
        id, 'Fotos', nome, mimeDe(p), buf.length, null, null).lastInsertRowid);
      conteudo.gravar(aid, buf);
      fotosTot++;
    });
  }
  audit(null, 'imovel_importado_site', `${codigo} (${ref})`);
  console.log(`  ${im ? 'atualizado' : 'novo'} ${codigo} · ${tipo} · ${campos.bairro || ''} · R$ ${(campos.valor || 0).toLocaleString('pt-BR')} · ${fotos.length} fotos`);
}

console.log(`\nPronto: ${novos} novo(s), ${atualizados} atualizado(s), ${fotosTot} foto(s) gravadas.`);
process.exit(0);
