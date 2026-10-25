// Monitor direto dos portais (sem depender de alerta por e-mail).
//
// Só lê o que o portal oferece abertamente para robôs: o mapa do site (sitemap) com os anúncios novos e a
// página pública do anúncio, respeitando o robots.txt, devagar (uma página por vez, com pausa) e se
// identificando. Portais que bloqueiam leitura automática (ZAP, Viva Real, OLX, Imovelweb) NÃO são forçados:
// para eles existe o botão "Mandar pro Radar" no navegador do corretor.
//
// Fonte ativa: Chaves na Mão (sitemap-venda-imoveis-01/02, atualizado todo dia, ~50 mil anúncios novos).
'use strict';
const zlib = require('zlib');
const cfg = require('../config');
const { getConfig, setConfig, audit } = require('../db');
const alertas = require('./alertas');

const UA = 'Mozilla/5.0 (compatible; SistemaRUAH-Radar/1.0; leitura de anúncios novos para captação)';
const BASE = 'https://www.chavesnamao.com.br';
const PAUSA_MS = 4000;          // entre uma página e outra do mesmo portal
const DETALHES_POR_RODADA = 25; // anúncios novos abertos por rodada (o resto fica na fila)

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const BAIRROS_PADRAO = 'Cambuí, Nova Campinas, Guanabara, Bosque, Taquaral, Barão Geraldo, Alphaville, Swiss Park, Gramado, Sousas, Joaquim Egídio';
const bairros = () => (cfg.RADAR_BAIRROS || BAIRROS_PADRAO).split(',').map((b) => b.trim()).filter(Boolean).map((nome) => ({ nome, slug: slug(nome) }));
const ligado = () => cfg.RADAR_PORTAIS !== '0';
const intervaloMin = () => Math.max(30, parseInt(cfg.RADAR_PORTAIS_MIN, 10) || 60);
const TIPOS = [['casa-em-condominio', 'Casa em condomínio'], ['cobertura', 'Cobertura'], ['apartamento', 'Apartamento'], ['casa', 'Casa']];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (k, d) => { try { return JSON.parse(getConfig(k) || 'null') || d; } catch { return d; } };

async function baixa(url, comoBuffer) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(30000) });
  if (r.status === 403 || r.status === 429) { const e = new Error(`O portal recusou a leitura (${r.status}). Pausado até a próxima rodada.`); e.bloqueio = true; throw e; }
  if (!r.ok) throw new Error(`Portal respondeu ${r.status} em ${url}`);
  return comoBuffer ? Buffer.from(await r.arrayBuffer()) : r.text();
}

// Confere o robots.txt uma vez por dia: se o portal proibir sitemap ou anúncios, a leitura para sozinha.
async function robotsPermite() {
  const hoje = new Date().toISOString().slice(0, 10);
  const memo = json('portais_robots', {});
  if (memo.dia === hoje) return memo.ok;
  const t = await baixa(`${BASE}/robots.txt`);
  let todos = false, ok = true;
  for (const linha of t.split(/\r?\n/)) {
    const ua = linha.match(/^user-agent:\s*(.*)$/i); if (ua) { todos = ua[1].trim() === '*'; continue; }
    const d = linha.match(/^disallow:\s*(\S+)/i);
    if (todos && d && (d[1] === '/' || /^\/imovel\/?$|^\/sitemap/.test(d[1]))) ok = false;
  }
  setConfig('portais_robots', JSON.stringify({ dia: hoje, ok }));
  return ok;
}

// Lê do endereço do anúncio o que der: tipo, quartos, área, preço, bairro e id.
function doEndereco(url) {
  const m = url.match(/\/imovel\/([A-Za-z0-9-]+)\/id-(\d+)\/?$/); if (!m) return null;
  const s = m[1];
  const cid = s.match(/-sp-campinas-(.+?)(?:-\d+m2)?(?:-RS\d+)?$/); if (!cid) return null;
  const tipo = (TIPOS.find(([k]) => s.startsWith(k + '-a-venda')) || [])[1];
  return {
    id: m[2], tipo, bairroSlug: cid[1],
    quartos: +((s.match(/-(\d+)-quartos?-/) || [])[1] || 0) || null,
    area: +((s.match(/-(\d+)m2/) || [])[1] || 0) || null,
    valor: +((s.match(/-RS(\d+)$/) || [])[1] || 0) || null,
  };
}

// Abre a página pública do anúncio: título, foto, descrição e se quem anuncia tem CRECI (imobiliária/corretor).
async function detalhe(url) {
  const t = await baixa(url);
  const ld = [...t.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => { try { return JSON.parse(x[1]); } catch { return null; } }).filter(Boolean);
  const pagina = ld.flatMap((x) => x['@graph'] || [x]).find((x) => x['@type'] === 'WebPage') || {};
  const creci = (t.match(/\\?"creci\\?":\s*\\?"?([0-9A-Za-z-]+|null)/) || [])[1];
  const anunciante = creci && creci !== 'null' ? 'imobiliaria' : creci === 'null' ? 'particular' : 'desconhecido';
  const nome = ((pagina.description || '').match(/Falar com (.+?)(?:, ref|\.|$)/) || [])[1] || null;
  return { titulo: pagina.name || null, descricao: pagina.description || '', foto: pagina.primaryImageOfPage?.url || null, anunciante, nome };
}

let rodando = null;
function status() {
  const s = json('portais_status', null);
  const fila = json('portais_fila', []);
  const parado = s && ligado() && (Date.now() - new Date(s.em).getTime()) / 60000 > intervaloMin() * 3 + 10;
  return { ligado: ligado(), intervalo_min: intervaloMin(), rodando: !!rodando, ultima: s, fila: fila.length, parado, fontes: ['Chaves na Mão'], bairros: bairros().map((b) => b.nome),
    bloqueados: ['ZAP Imóveis', 'Viva Real', 'OLX', 'Imovelweb'] };
}

async function lerAgora({ log = () => {}, testar = false } = {}) {
  const r = { em: new Date().toISOString(), ok: false, fonte: 'Chaves na Mão', lidos: 0, campinas: 0, alvo: 0, novas: 0, precos: 0, repetidos: 0, fila: 0, erro: null, encontrados: [] };
  try {
    if (!(await robotsPermite())) throw new Error('O robots.txt do Chaves na Mão passou a proibir esta leitura. Monitor pausado.');
    const indice = await baixa(`${BASE}/sitemap-index.xml`);
    const mapas = [...indice.matchAll(/<loc>([^<]*sitemap-venda-imoveis-(\d+)\.xml(?:\.gz)?)<\/loc>\s*(?:<lastmod>([^<]+))?/g)]
      .map((m) => ({ url: m[1], n: +m[2], lastmod: m[3] || '' })).sort((a, b) => a.n - b.n).slice(0, 2);
    const vistos = json('portais_mapas', {});
    const alvoB = bairros();
    const conhecidos = new Set(json('portais_ids', []));
    const fila = json('portais_fila', []);
    const naFila = new Set(fila.map((x) => x.id));
    for (const mapa of mapas) {
      if (!testar && vistos[mapa.url] === mapa.lastmod && mapa.lastmod) { log(`${mapa.url.split('/').pop()}: sem mudança desde ${mapa.lastmod}`); continue; }
      await espera(PAUSA_MS);
      const buf = await baixa(mapa.url, true);
      let xml; try { xml = zlib.gunzipSync(buf).toString(); } catch { xml = buf.toString(); }
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+))?/g)];
      r.lidos += urls.length;
      for (const [, u, mod] of urls) {
        if (!u.includes('-sp-campinas-')) continue;
        r.campinas++;
        const a = doEndereco(u); if (!a || !a.tipo) continue;
        const b = alvoB.find((x) => a.bairroSlug === x.slug || a.bairroSlug.endsWith('-' + x.slug) || a.bairroSlug.startsWith(x.slug + '-') || a.bairroSlug.includes('-' + x.slug + '-'));
        if (!b) continue;
        r.alvo++;
        if (conhecidos.has(a.id) || naFila.has(a.id)) continue;
        fila.push({ id: a.id, url: u, quando: (mod || r.em).slice(0, 10), bairro: b.nome, tipo: a.tipo, quartos: a.quartos, area: a.area, valor: a.valor });
        naFila.add(a.id);
      }
      if (!testar) vistos[mapa.url] = mapa.lastmod;
      log(`${mapa.url.split('/').pop()}: ${urls.length} anúncios no Brasil, ${r.alvo} nos bairros da RUAH até agora`);
    }
    // abre os novos aos poucos (mais novos primeiro)
    fila.sort((x, y) => +y.id - +x.id);
    const agora = fila.splice(0, testar ? 5 : DETALHES_POR_RODADA);
    for (const it of agora) {
      await espera(PAUSA_MS);
      let d = { titulo: null, descricao: '', anunciante: 'desconhecido', nome: null };
      try { d = await detalhe(it.url); } catch (e) { if (e.bloqueio) { fila.unshift(it); throw e; } log(`não abriu ${it.url}: ${e.message}`); }
      const anuncio = {
        portal: 'Chaves na Mão', link: it.url, titulo: d.titulo || `${it.tipo} ${it.quartos ? it.quartos + ' quartos ' : ''}${it.area ? it.area + ' m² ' : ''}${it.bairro}`,
        tipo: it.tipo, bairro: it.bairro, cidade: 'Campinas', quartos: it.quartos, vagas: null, area: it.area, valor: it.valor,
        anunciante_tipo: d.anunciante, texto: [d.descricao, d.nome ? `Anunciante: ${d.nome}` : ''].filter(Boolean).join(' · '),
        origem: 'monitor direto do Chaves na Mão',
      };
      if (testar) { r.encontrados.push(anuncio); continue; }
      const res = alertas.registra(anuncio, it.quando);
      if (res === 'nova') r.novas++; else if (res === 'preco') r.precos++; else r.repetidos++;
      conhecidos.add(it.id);
      log(`${res}: ${anuncio.titulo} · ${anuncio.anunciante_tipo}`);
    }
    if (!testar) {
      setConfig('portais_ids', JSON.stringify([...conhecidos].slice(-20000)));
      setConfig('portais_fila', JSON.stringify(fila.slice(0, 2000)));
      setConfig('portais_mapas', JSON.stringify(vistos));
      if (r.novas || r.precos || agora.length) alertas.anotaPortal('Chaves na Mão', new Date().toISOString(), agora.length || 1, false);
    }
    r.fila = fila.length;
    r.ok = true;
  } catch (e) {
    r.erro = e.message;
  }
  if (!testar) {
    const { encontrados, ...resumo } = r;
    setConfig('portais_status', JSON.stringify(resumo));
    if (r.novas || r.precos) audit(null, 'radar_portais', `${r.novas} nova(s), ${r.precos} queda(s) de preço (Chaves na Mão)`);
  }
  return r;
}

function ler(opcoes = {}) {
  if (rodando) return rodando;
  rodando = lerAgora(opcoes).finally(() => { rodando = null; });
  return rodando;
}

let timer = null;
function iniciar() {
  if (!ligado() || timer) return;
  const roda = () => ler().catch(() => { /* erro fica no status */ });
  setTimeout(roda, 45000);
  timer = setInterval(roda, intervaloMin() * 60000);
  timer.unref?.();
  console.log(`  Monitor direto dos portais: Chaves na Mão a cada ${intervaloMin()} min.`);
}

module.exports = { status, ler, iniciar, doEndereco, detalhe, bairros };
