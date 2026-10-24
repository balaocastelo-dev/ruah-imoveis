// Cadastro inteligente: CEP (ViaCEP), localização (OpenStreetMap) e condomínio já conhecido pelo endereço.
const { one } = require('../db');
const { CIDADE_PADRAO, UF_PADRAO } = require('../config');

const UA = 'SistemaRUAH/1.0 (cadastro de imoveis)';
const soDigitos = (s) => String(s || '').replace(/\D/g, '');

async function getJson(url, ms = 7000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function viaCep(cep) {
  const c = soDigitos(cep);
  if (c.length !== 8) return null;
  const j = await getJson(`https://viacep.com.br/ws/${c}/json/`);
  if (j.erro) return null;
  return { cep: c, logradouro: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf };
}

// Sem CEP: procura o CEP pela rua (ViaCEP aceita UF/Cidade/Rua).
async function cepPorRua(logradouro, cidade, uf) {
  if (!logradouro || logradouro.trim().length < 3) return null;
  const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(cidade)}/${encodeURIComponent(logradouro.trim())}/json/`;
  const lista = await getJson(url);
  if (!Array.isArray(lista) || !lista.length) return null;
  const j = lista[0];
  return { cep: soDigitos(j.cep), logradouro: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf, variacoes: lista.length };
}

// OpenStreetMap: coordenadas e, quando o prédio está mapeado com nome, o nome do condomínio.
async function osm(logradouro, numero, cidade, uf) {
  const p = new URLSearchParams({
    format: 'jsonv2', addressdetails: '1', namedetails: '1', limit: '3',
    street: `${numero || ''} ${logradouro}`.trim(), city: cidade, state: uf, country: 'Brasil',
  });
  const lista = await getJson(`https://nominatim.openstreetmap.org/search?${p}`, 8000);
  if (!Array.isArray(lista) || !lista.length) return null;
  const r = lista[0];
  const nome = r.name && !/^\d+$/.test(r.name) && !String(logradouro).toLowerCase().includes(String(r.name).toLowerCase()) ? r.name : null;
  return { lat: parseFloat(r.lat), lon: parseFloat(r.lon), nome_predio: nome, bairro: r.address && (r.address.suburb || r.address.neighbourhood) };
}

function condominioConhecido(cep, logradouro, numero) {
  if (!numero) return null;
  const c = soDigitos(cep);
  if (c) {
    const r = one('SELECT * FROM condominios WHERE cep=? AND numero=?', c, String(numero).trim());
    if (r) return r;
  }
  if (logradouro) return one('SELECT * FROM condominios WHERE lower(logradouro)=lower(?) AND numero=?', logradouro.trim(), String(numero).trim()) || null;
  return null;
}

// Junta tudo e diz de onde veio cada dado (o corretor confere os campos marcados como automáticos).
async function pesquisar({ cep, logradouro, numero, cidade, uf }) {
  cidade = cidade || CIDADE_PADRAO; uf = uf || UF_PADRAO;
  const out = { campos: {}, fontes: {}, avisos: [] };
  const set = (k, v, fonte) => { if (v !== undefined && v !== null && v !== '') { out.campos[k] = v; out.fontes[k] = fonte; } };

  let base = null;
  try { base = cep ? await viaCep(cep) : await cepPorRua(logradouro, cidade, uf); }
  catch { out.avisos.push('Não consegui consultar os Correios agora (ViaCEP). Preencha o endereço manualmente.'); }
  if (base) {
    set('cep', base.cep, 'Correios'); set('logradouro', base.logradouro, 'Correios');
    set('bairro', base.bairro, 'Correios'); set('cidade', base.cidade, 'Correios'); set('uf', base.uf, 'Correios');
    if (base.variacoes > 1) out.avisos.push('A rua tem mais de um CEP. Confira o CEP pelo número.');
  } else if (cep) out.avisos.push('CEP não encontrado.');

  const L = out.campos.logradouro || logradouro, C = out.campos.cidade || cidade, U = out.campos.uf || uf;
  const cond = condominioConhecido(out.campos.cep || cep, L, numero);
  if (cond) {
    out.condominio = cond;
    set('condominio_nome', cond.nome, 'Cadastro RUAH');
    set('ano_construcao', cond.ano_construcao, 'Cadastro RUAH');
    set('lazer', cond.lazer, 'Cadastro RUAH');
    set('administradora', cond.administradora, 'Cadastro RUAH');
  }

  if (L && numero) {
    try {
      const g = await osm(L, numero, C, U);
      if (g) {
        set('lat', g.lat, 'OpenStreetMap'); set('lon', g.lon, 'OpenStreetMap');
        if (!out.campos.bairro && g.bairro) set('bairro', g.bairro, 'OpenStreetMap');
        if (!cond && g.nome_predio) set('condominio_nome', g.nome_predio, 'OpenStreetMap');
      }
    } catch { out.avisos.push('Mapa indisponível agora; a localização fica para depois.'); }
  }
  if (!out.campos.condominio_nome && numero) out.avisos.push('Condomínio ainda não conhecido neste endereço. Ao salvar, ele fica gravado e os próximos cadastros no mesmo número saem automáticos.');
  return out;
}

module.exports = { pesquisar, viaCep, soDigitos };
