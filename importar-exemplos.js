// Importa alguns imóveis do site da RUAH (ruahimobiliaria.com.br) como exemplos.
// Uso (na pasta do sistema):  node importar-exemplos.js
// Pode rodar de novo: imóveis já importados são pulados.
const { one, run, audit } = require('./src/db');
const drive = require('./src/services/drive');

const SITE = 'https://www.ruahimobiliaria.com.br';
const LISTA = [
  '/imovel/apartamento-campinas-4-quartos-181-m/AP0029-RUAH',
  '/imovel/apartamento-campinas-3-quartos-164-m/AP0023-RUAH',
  '/imovel/apartamento-campinas-3-quartos-170-m/AP0031-RUAH',
  '/imovel/apartamento-campinas-2-quartos-89-m/AP0028-RUAH',
  '/imovel/apartamento-campinas-2-quartos-65-m/AP0027-RUAH',
  '/imovel/apartamento-campinas-3-quartos-127-m/AP0003-RUAH',
  '/imovel/apartamento-duplex-campinas-4-quartos-200-m/AD0001-RUAH',
  '/imovel/casa-campinas-4-quartos-358-m/CA0052-RUAH',
  '/imovel/casa-campinas-5-quartos-795-m/CA0027-RUAH',
  '/imovel/casa-campinas-4-quartos-504-m/CA0001-RUAH',
  '/imovel/sobrado-campinas-3-quartos-580-m/SO0001-RUAH',
  '/imovel/terreno-campinas-5-020-m/TE0004-RUAH',
];
const MAX_FOTOS = Number(process.argv[2]) || 8;

const LAZER = {
  SWIMMING_POOL: 'Piscina', BARBECUE_GRILL: 'Churrasqueira', SPORTS_COURT: 'Quadra', GYM: 'Academia',
  PARTY_HALL: 'Salão de festas', PLAYGROUND: 'Playground', SAUNA: 'Sauna', ELEVATOR: 'Elevador',
  GOURMET_AREA: 'Espaço gourmet', TENNIS_COURT: 'Quadra de tênis', SECURITY_24_HOURS: 'Portaria 24h',
  GATED_COMMUNITY: 'Condomínio fechado', GAME_ROOM: 'Salão de jogos', SPA: 'Spa', GARDEN: 'Jardim',
};

const v = (x) => (Array.isArray(x) ? x[0] : x) || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function baixarTexto(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Sistema RUAH - importacao de exemplos)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

// A página traz um objeto JSON com todos os dados do anúncio (o mesmo que o site usa para montar a ficha).
function extrairAnuncio(html) {
  const i = html.indexOf('"listing_description"');
  if (i < 0) throw new Error('dados do anúncio não encontrados na página');
  for (let st = html.lastIndexOf('{', i); st > Math.max(0, i - 200000); st = html.lastIndexOf('{', st - 1)) {
    // tenta fechar o objeto contando chaves (respeitando strings)
    let prof = 0, emStr = false, esc = false, fim = -1;
    for (let k = st; k < html.length; k++) {
      const c = html[k];
      if (emStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') emStr = false; continue; }
      if (c === '"') emStr = true; else if (c === '{') prof++; else if (c === '}') { prof--; if (prof === 0) { fim = k; break; } }
    }
    if (fim < i) continue;
    try {
      const o = JSON.parse(html.slice(st, fim + 1));
      if (o.listing_description !== undefined && o.photos) return o;
    } catch { /* continua procurando */ }
  }
  throw new Error('não foi possível ler os dados do anúncio');
}

function tipoDo(d) {
  const t = String(d.property_type || '').toUpperCase();
  if (t.includes('PENTHOUSE')) return 'Cobertura';
  if (t.includes('APARTMENT') || t.includes('DUPLEX') || t.includes('FLAT')) return 'Apartamento';
  if (t.includes('LAND') || t.includes('LOT')) return 'Terreno';
  if (t.includes('FARM') || t.includes('RANCH')) return 'Chácara';
  if (t.includes('HOUSE') || t.includes('HOME') || t.includes('SOBRADO') || t.includes('TOWNHOUSE')) return d.building ? 'Casa em condomínio' : 'Casa';
  return 'Casa';
}

function condominio(d) {
  if (!d.building || String(d.building).trim().length < 3) return null; // ex.: "B" = nome da torre, não do condomínio
  const ex = one('SELECT id FROM condominios WHERE nome=? AND coalesce(cidade,\'\')=?', d.building, d.city || '');
  if (ex) return ex.id;
  const lazer = (d.amenities || []).map((a) => LAZER[a]).filter(Boolean).join(', ') || null;
  return Number(run('INSERT INTO condominios(nome,bairro,cidade,uf,lazer) VALUES(?,?,?,?,?)',
    d.building, d.neighborhood || null, d.city || null, d.state || 'SP', lazer).lastInsertRowid);
}

async function importar(caminho) {
  const url = SITE + caminho;
  const d = extrairAnuncio(await baixarTexto(url));
  const codigo = d.property_reference || caminho.match(/([A-Z]{2}\d{4})-RUAH/)[1];
  if (one('SELECT id FROM imoveis WHERE codigo=?', codigo)) return { codigo, pulado: true };
  const tipo = tipoDo(d);
  const iptuAno = d.property_tax ? (String(d.property_tax_payment).toUpperCase() === 'MONTHLY' ? d.property_tax * 12 : d.property_tax) : null;
  const descricao = String(d.listing_description || '').replace(/\r\n/g, '\n').trim()
    + `\n\n— Exemplo importado do site da RUAH (código original ${codigo}): ${url}`;
  const id = Number(run(`INSERT INTO imoveis(codigo,tipo,status,bairro,cidade,uf,condominio_id,quartos,suites,vagas,area_util,area_total,valor,valor_condominio,iptu,descricao)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    codigo, tipo, 'publicado', d.neighborhood || null, d.city || 'Campinas', d.state || 'SP', condominio(d),
    v(d.bedrooms), v(d.suites), v(d.garages), v(d.usable_floor_area) || v(d.area), v(d.gross_floor_area) || v(d.area),
    v(d.sale_price), d.condo_fees || null, iptuAno, descricao).lastInsertRowid);

  let fotos = 0;
  for (const [n, f] of (d.photos || []).filter((p) => (p.media_type || 'PHOTO') === 'PHOTO').slice(0, MAX_FOTOS).entries()) {
    for (const src of [f.picture_full, f.picture_full_fallback].filter(Boolean)) {
      try {
        const r = await fetch(src);
        const mime = (r.headers.get('content-type') || '').split(';')[0];
        if (!r.ok || !mime.startsWith('image/')) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        await drive.salvarArquivo({ imovelId: id, categoria: 'Fotos', nome: `${codigo}-foto-${String(n + 1).padStart(2, '0')}.jpg`, mime, buffer: buf });
        fotos++;
        break;
      } catch { /* tenta o endereço alternativo */ }
    }
  }
  audit(null, 'imovel_importado_site', codigo);
  return { codigo, tipo, valor: v(d.sale_price), bairro: d.neighborhood, condominio: d.building, fotos, total_fotos: (d.photos || []).length };
}

(async () => {
  console.log('Importando imóveis de exemplo do site da RUAH...\n');
  let ok = 0;
  for (const c of LISTA) {
    try {
      const r = await importar(c);
      if (r.pulado) console.log(`  ${r.codigo}: já existe, pulado`);
      else { ok++; console.log(`  ${r.codigo}: ${r.tipo}, ${r.bairro || ''}${r.condominio ? ' - ' + r.condominio : ''}, R$ ${Number(r.valor || 0).toLocaleString('pt-BR')}, ${r.fotos} fotos`); }
    } catch (e) { console.log(`  ERRO em ${c}: ${e.message}`); }
    await sleep(800);
  }
  console.log(`\nPronto: ${ok} imóveis importados.`);
  process.exit(0);
})();
