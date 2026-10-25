// Radar automático: lê os alertas de busca que os portais mandam para o e-mail do radar
// (OLX, ZAP, Viva Real, Imovelweb, Chaves na Mão) e transforma cada anúncio em oportunidade.
// Só lê a caixa (não apaga, não responde, não marca como lida). Só aceita e-mails assinados pelo portal (DKIM/SPF do Gmail).
const { ImapFlow } = require('imapflow');
const { parse } = require('node-html-parser');
const cfg = require('../config');
const { one, all, run, getConfig, setConfig, audit } = require('../db');
const ia = require('./ia');

const PORTAIS = [
  { nome: 'OLX', dominios: ['olx.com.br'], anuncio: /^https?:\/\/([a-z0-9-]+\.)?olx\.com\.br\/.+-(\d{8,})(?:[/?#]|$)/i },
  { nome: 'ZAP Imóveis', dominios: ['zapimoveis.com.br'], anuncio: /^https?:\/\/(www\.)?zapimoveis\.com\.br\/imovel\/[a-z0-9-]+/i },
  { nome: 'Viva Real', dominios: ['vivareal.com.br'], anuncio: /^https?:\/\/(www\.)?vivareal\.com\.br\/imovel\/[a-z0-9-]+/i },
  { nome: 'Imovelweb', dominios: ['imovelweb.com.br'], anuncio: /^https?:\/\/(www\.)?imovelweb\.com\.br\/propriedades\/[a-z0-9-]+/i },
  { nome: 'Chaves na Mão', dominios: ['chavesnamao.com.br'], anuncio: /^https?:\/\/(www\.)?chavesnamao\.com\.br\/imovel\/[a-z0-9-]+/i },
];
const CIDADES = 'Campinas|Valinhos|Vinhedo|Paulínia|Sumaré|Hortolândia|Indaiatuba|Jaguariúna|Americana|Itatiba|Monte Mor|Nova Odessa|Santa Bárbara d.Oeste|Cosmópolis|Pedreira';

const configurado = () => !!(cfg.RADAR_EMAIL && cfg.RADAR_EMAIL_SENHA);
const intervaloMin = () => Math.max(5, parseInt(cfg.RADAR_INTERVALO_MIN, 10) || 10);
const dominioDe = (s) => (String(s || '').match(/@([a-z0-9.-]+)/i) || [])[1]?.toLowerCase() || '';
const casa = (dom, lista) => lista.some((d) => dom === d || dom.endsWith('.' + d));
const portalDoDominio = (dom) => PORTAIS.find((p) => casa(dom, p.dominios));
const limpa = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// texto do bloco com separadores entre parágrafos/células (senão "R$ 1.250.000" gruda em "3 quartos")
const textoDe = (n) => limpa(String(n.structuredText || n.textContent || '').replace(/\n+/g, ' | '));
const numBR = (s) => { const n = Number(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

// O Gmail grava em "Authentication-Results" se o e-mail foi mesmo assinado pelo domínio do portal.
function remetenteConfiavel(headers) {
  const auth = String(headers['authentication-results'] || '').toLowerCase();
  const de = dominioDe(headers.from);
  const portal = portalDoDominio(de);
  if (!portal) return null;
  const dkim = [...auth.matchAll(/dkim=pass[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)/g)].map((m) => m[1]);
  const spf = [...auth.matchAll(/spf=pass[^;]*?smtp\.mailfrom=(?:[^@\s;]*@)?([a-z0-9.-]+)/g)].map((m) => m[1]);
  const ok = dkim.some((d) => casa(d, portal.dominios)) || (spf.some((d) => casa(d, portal.dominios)) && /dmarc=pass/.test(auth));
  return ok ? portal : null;
}

function cabecalhos(buf) {
  const h = {}; let atual = null;
  for (const linha of String(buf || '').split(/\r?\n/)) {
    if (/^\s/.test(linha) && atual) { h[atual] += ' ' + linha.trim(); continue; }
    const m = linha.match(/^([\w-]+):\s*(.*)$/);
    if (m) { atual = m[1].toLowerCase(); h[atual] = h[atual] ? h[atual] + '; ' + m[2] : m[2]; }
  }
  return h;
}

// Links de alerta costumam passar por um rastreador (clique) antes do anúncio. Seguimos só os redirecionamentos,
// sem abrir a página do anúncio.
async function resolveLink(url, portal) {
  let u = url;
  for (let i = 0; i < 5; i++) {
    const canon = canonico(u);
    if (PORTAIS.some((p) => p.anuncio.test(canon))) return canon;
    if (!/^https:\/\//i.test(u)) return null;
    try {
      const r = await fetch(u, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (Sistema RUAH - leitor de alertas)' } });
      try { r.body?.cancel(); } catch { /* sem corpo */ }
      const loc = r.headers.get('location');
      if (!loc || r.status < 300 || r.status > 399) return null;
      u = new URL(loc, u).toString();
    } catch { return null; }
  }
  return null;
}
const canonico = (u) => { try { const x = new URL(u); x.hash = ''; x.search = ''; return x.toString().replace(/\/$/, ''); } catch { return u; } };

// Extrai os dados de um "cartão" de anúncio do texto do e-mail.
function extraiCampos(texto, titulo) {
  const t = limpa(texto);
  const valores = [...t.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/g)].map((m) => numBR(m[1])).filter((v) => v && v >= 30000);
  const cond = t.match(/condom[ií]nio:?\s*R\$\s*([\d.]+)/i);
  const iptu = t.match(/iptu:?\s*R\$\s*([\d.]+)/i);
  const tudo = `${titulo || ''} ${t}`;
  const tipo = /cobertura/i.test(tudo) ? 'Cobertura' : /apartamento|apto\b|flat|studio|kitnet/i.test(tudo) ? 'Apartamento'
    : /terreno|lote\b/i.test(tudo) ? 'Terreno' : /ch[aá]cara|s[ií]tio/i.test(tudo) ? 'Chácara'
      : /sala comercial|conjunto comercial/i.test(tudo) ? 'Sala comercial' : /galp[aã]o|barrac[aã]o/i.test(tudo) ? 'Galpão'
        : /\bloja\b/i.test(tudo) ? 'Loja' : /casa|sobrado/i.test(tudo) ? (/condom[ií]nio/i.test(tudo) ? 'Casa em condomínio' : 'Casa') : null;
  const local = t.match(new RegExp(`([A-ZÀ-Ý][\\wÀ-ÿ'. -]{2,40}?)\\s*[,–-]\\s*(${CIDADES})\\b`)) || t.match(new RegExp(`\\b(${CIDADES})\\s*[,–-]\\s*([A-ZÀ-Ý][\\wÀ-ÿ'. -]{2,40}?)(?=\\s*(?:[|•·,–-]|\\d|R\\$|$))`));
  let bairro = null, cidade = null;
  if (local) {
    if (new RegExp(`^(${CIDADES})$`).test(local[1])) { cidade = local[1]; bairro = local[2]; } else { bairro = local[1]; cidade = local[2]; }
  }
  if (bairro && /^(em|no|na|de|à venda)\b/i.test(bairro)) bairro = bairro.replace(/^(em|no|na|de|à venda)\s+/i, '');
  const anunciante = /\bparticular\b|propriet[aá]rio|direto com o dono/i.test(tudo) ? 'particular'
    : /imobili[aá]ria|\bprofissional\b|creci|corretor/i.test(tudo) ? 'imobiliaria' : 'desconhecido';
  return {
    valor: (() => { const v = valores.filter((x) => !cond || x !== numBR(cond[1])); return v.length ? Math.max(...v) : null; })(),
    valor_condominio: cond ? numBR(cond[1]) : null, iptu: iptu ? numBR(iptu[1]) : null,
    quartos: (tudo.match(/(\d{1,2})\s*(?:quartos?|dorm(?:it[oó]rios?|s)?\.?)\b/i) || [])[1] || null,
    vagas: (tudo.match(/(\d{1,2})\s*vagas?\b/i) || [])[1] || null,
    area: numBR((tudo.match(/(\d{2,6}(?:[.,]\d+)?)\s*m(?:²|2)(?![a-z0-9])/i) || [])[1] || '') || null,
    tipo, bairro: bairro ? limpa(bairro).slice(0, 80) : null, cidade: cidade || null, anunciante_tipo: anunciante,
  };
}

// Encontra os anúncios dentro do HTML do alerta.
async function anunciosDoEmail(html, texto, portal) {
  const doc = parse(html || `<pre>${String(texto || '').replace(/</g, '&lt;')}</pre>`);
  const porLink = new Map();
  const links = doc.querySelectorAll('a[href]').slice(0, 120);
  const resolvidos = new Map();
  for (const a of links) {
    const href = a.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href) || /unsubscribe|descadastr|preferenc|privacidade|ajuda|help|app\.|play\.google|apps\.apple|facebook\.com|instagram\.com|twitter\.com|youtube\.com/i.test(href)) continue;
    if (!resolvidos.has(href)) {
      if (resolvidos.size >= 40) break;
      resolvidos.set(href, PORTAIS.some((p) => p.anuncio.test(canonico(href))) ? canonico(href) : await resolveLink(href, portal));
    }
    const link = resolvidos.get(href);
    if (!link) continue;
    // sobe na árvore até achar o bloco do anúncio (com preço), sem pegar o e-mail inteiro
    let bloco = a, txt = textoDe(a);
    for (let i = 0; i < 8 && bloco.parentNode; i++) {
      const pai = bloco.parentNode; const t = textoDe(pai);
      if (t.length > 700) break;
      bloco = pai; txt = t;
      if (/R\$\s*\d/.test(t) && t.length > 40) break;
    }
    const img = a.querySelector('img');
    const titulo = limpa(a.textContent).length > 8 ? limpa(a.textContent) : (img && limpa(img.getAttribute('alt'))) || null;
    const atual = porLink.get(link) || { link, textos: new Set(), titulo: null, foto: null };
    atual.textos.add(txt);
    if (titulo && (!atual.titulo || titulo.length > atual.titulo.length) && !/^ver (an[uú]ncio|im[oó]vel|mais)|^confira|^clique/i.test(titulo)) atual.titulo = titulo.slice(0, 200);
    if (!atual.foto && img && /^https:\/\//.test(img.getAttribute('src') || '')) atual.foto = img.getAttribute('src');
    porLink.set(link, atual);
  }
  return [...porLink.values()].map((x) => {
    const texto0 = [...x.textos].sort((a, b) => b.length - a.length)[0] || '';
    const portalLink = PORTAIS.find((p) => p.anuncio.test(x.link)) || portal;
    return { portal: portalLink.nome, link: x.link, titulo: x.titulo, texto: texto0.slice(0, 700), ...extraiCampos(texto0, x.titulo) };
  });
}

// IA local completa o que a leitura automática não achou (só se o Ollama estiver ligado).
async function completaComIA(a) {
  if (cfg.IA_MODO === 'desligado') return a;
  try {
    const r = await fetch(`${cfg.OLLAMA_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: cfg.OLLAMA_MODEL, stream: false, think: false, format: 'json', options: { temperature: 0, num_predict: 200 },
        messages: [{ role: 'system', content: 'Extraia dados de um anúncio de imóvel. Responda só JSON com as chaves: titulo, tipo (Apartamento, Casa, Casa em condomínio, Cobertura, Terreno, Chácara, Sala comercial, Loja, Galpão), bairro, cidade, valor (número em reais), quartos, vagas, area (m²), anunciante (particular, imobiliaria ou desconhecido). Use null quando não souber. Não invente.' },
          { role: 'user', content: a.texto }],
      }),
    });
    if (!r.ok) return a;
    const j = JSON.parse((await r.json()).message?.content || '{}');
    const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    return {
      ...a, titulo: a.titulo || (j.titulo ? String(j.titulo).slice(0, 200) : null), tipo: a.tipo || j.tipo || null,
      bairro: a.bairro || (j.bairro ? String(j.bairro).slice(0, 80) : null), cidade: a.cidade || j.cidade || null,
      valor: a.valor || n(j.valor), quartos: a.quartos || n(j.quartos), vagas: a.vagas || n(j.vagas), area: a.area || n(j.area),
      anunciante_tipo: a.anunciante_tipo !== 'desconhecido' ? a.anunciante_tipo : (['particular', 'imobiliaria'].includes(j.anunciante) ? j.anunciante : 'desconhecido'),
    };
  } catch { return a; }
}

// Grava no radar: novo anúncio, queda de preço ou repetido.
function registra(a, quando) {
  const ev = (id, texto) => run('INSERT INTO oportunidade_eventos(oportunidade_id,etapa,texto) VALUES(?,?,?)', id, 'sistema', texto);
  const brl = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const existe = one('SELECT * FROM oportunidades WHERE link=?', a.link);
  if (existe) {
    if (a.valor && existe.valor && a.valor < existe.valor - 1) {
      run("UPDATE oportunidades SET valor_anterior=?, valor=?, atualizado_em=datetime('now','localtime') WHERE id=?", existe.valor, a.valor, existe.id);
      ev(existe.id, `Preço caiu de ${brl(existe.valor)} para ${brl(a.valor)} (alerta ${a.portal}).`);
      return 'preco';
    }
    return 'repetido';
  }
  // mesmo imóvel em outro portal: mesmo bairro, valor e área parecidos
  if (a.bairro && a.valor && a.area) {
    const gemea = all("SELECT * FROM oportunidades WHERE status!='descartada' AND bairro=? AND abs(valor-?)<=?*0.01 AND abs(coalesce(area,0)-?)<=2", a.bairro, a.valor, a.valor, a.area)[0];
    if (gemea) { if (!one("SELECT 1 FROM oportunidade_eventos WHERE oportunidade_id=? AND texto LIKE ?", gemea.id, '%' + a.link + '%')) ev(gemea.id, `Provavelmente o mesmo imóvel anunciado também no ${a.portal}: ${a.link}`); return 'repetido'; }
  }
  const id = Number(run(`INSERT INTO oportunidades(portal,link,titulo,tipo,bairro,cidade,quartos,vagas,area,valor,anunciante_tipo,publicado_em,observacoes)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, a.portal, a.link, a.titulo, a.tipo, a.bairro, a.cidade || cfg.CIDADE_PADRAO,
    a.quartos ? parseInt(a.quartos, 10) : null, a.vagas ? parseInt(a.vagas, 10) : null, a.area, a.valor, a.anunciante_tipo, quando,
    `${a.origem ? 'Texto do anúncio' : 'Texto do alerta'}: ${a.texto}`.slice(0, 2000)).lastInsertRowid);
  ev(id, `Encontrada automaticamente ${a.origem ? 'pelo ' + a.origem : 'no alerta de e-mail do ' + a.portal}: ${a.link}`);
  if (a.anunciante_tipo === 'imobiliaria') ev(id, 'Anunciado por imobiliária: não abordar o dono (provável exclusividade).');
  return 'nova';
}

function salvaStatus(s) { setConfig('alertas_status', JSON.stringify(s)); }
const json = (k, d) => { try { return JSON.parse(getConfig(k) || 'null') || d; } catch { return d; } };
// Vigia do radar: o sistema avisa quando os portais param de mandar alertas ou a leitura para.
const maxHoras = () => Math.max(6, parseInt(cfg.RADAR_ALERTA_MAX_HORAS, 10) || 24);
function saude(s) {
  const agora = Date.now();
  const porPortal = json('alertas_por_portal', {});
  const datas = Object.values(porPortal).map((p) => p.ultimo).filter(Boolean).sort();
  const ultimoAlerta = datas.length ? datas[datas.length - 1] : null;
  const inicio = getConfig('alertas_inicio');
  const base = ultimoAlerta || inicio;
  const horasSemAlerta = base ? Math.floor((agora - new Date(base).getTime()) / 36e5) : null;
  const problemas = [];
  if (!configurado()) return { ok: true, problemas, porPortal, ultimoAlerta, horasSemAlerta, maxHoras: maxHoras() };
  if (s && s.erro) problemas.push({ tipo: 'erro', texto: s.erro });
  const minLeitura = s ? (agora - new Date(s.em).getTime()) / 60000 : null;
  if (minLeitura !== null && minLeitura > intervaloMin() * 3 + 5) problemas.push({ tipo: 'parado', texto: `A leitura automática parou: a última foi há ${Math.round(minLeitura / 60) >= 1 ? Math.round(minLeitura / 60) + ' h' : Math.round(minLeitura) + ' min'}. O sistema está aberto?` });
  if (horasSemAlerta !== null && horasSemAlerta >= maxHoras()) problemas.push({ tipo: 'silencio', texto: ultimoAlerta
    ? `Nenhum alerta dos portais chega há ${horasSemAlerta} h (o último foi em ${new Date(ultimoAlerta).toLocaleString('pt-BR')}). Confira os alertas no ZAP, Viva Real e OLX.`
    : `Nenhum alerta dos portais chegou em ${horasSemAlerta} h desde que o radar foi ligado. Confira se os alertas do ZAP, Viva Real e OLX estão ativos e mandando para ${cfg.RADAR_EMAIL}.` });
  for (const [nome, p] of Object.entries(porPortal)) {
    if ((p.vazios || 0) >= 3) problemas.push({ tipo: 'leitura', texto: `Os últimos ${p.vazios} e-mails do ${nome} vieram sem nenhum anúncio reconhecido. O formato do e-mail pode ter mudado: rode "node ler-alertas.js --testar --dias 3".` });
  }
  return { ok: !problemas.length, problemas, porPortal, ultimoAlerta, horasSemAlerta, maxHoras: maxHoras() };
}
function status() {
  const s = json('alertas_status', null);
  return { configurado: configurado(), email: cfg.RADAR_EMAIL || null, pasta: cfg.RADAR_EMAIL_PASTA || 'INBOX', intervalo_min: intervaloMin(), rodando: !!emAndamento, ultima: s, saude: saude(s),
    hoje: one("SELECT count(*) n FROM oportunidade_eventos WHERE texto LIKE 'Encontrada automaticamente%' AND date(em)=date('now','localtime')").n };
}
function anotaPortal(nome, quando, nAnuncios, boasVindas) {
  const pp = json('alertas_por_portal', {});
  const p = pp[nome] || { ultimo: null, emails: 0, vazios: 0 };
  if (!p.ultimo || quando > p.ultimo) p.ultimo = quando;
  p.emails = (p.emails || 0) + 1;
  if (nAnuncios) p.vazios = 0; else if (!boasVindas) p.vazios = (p.vazios || 0) + 1;
  pp[nome] = p; setConfig('alertas_por_portal', JSON.stringify(pp));
}

let emAndamento = null;
// testar=true: só mostra o que encontraria, sem gravar.  dias: relê os últimos N dias.
// Um pedido feito durante uma leitura espera ela terminar (antes o "Reler 7 dias" era engolido).
function ler(opcoes = {}) {
  if (emAndamento) {
    if (!opcoes.dias && !opcoes.testar) return emAndamento;
    return emAndamento.catch(() => {}).then(() => ler(opcoes));
  }
  emAndamento = lerAgora(opcoes).finally(() => { emAndamento = null; });
  return emAndamento;
}

async function lerAgora({ testar = false, dias = null, log = () => {} } = {}) {
  if (!configurado()) throw new Error('E-mail do radar não configurado (RADAR_EMAIL e RADAR_EMAIL_SENHA no .env).');
  const r = { em: new Date().toISOString(), ok: false, emails: 0, ignorados: 0, anuncios: 0, novas: 0, precos: 0, repetidos: 0, erro: null, encontrados: [] };
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: cfg.RADAR_EMAIL, pass: String(cfg.RADAR_EMAIL_SENHA).replace(/\s+/g, '') }, logger: false, socketTimeout: 60000, connectionTimeout: 20000, greetingTimeout: 15000 });
  let usaIA = null;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(cfg.RADAR_EMAIL_PASTA || 'INBOX', { readOnly: true });
    try {
      const mb = client.mailbox;
      const validade = String(mb.uidValidity);
      let ultimo = getConfig('alertas_uidvalidity') === validade ? parseInt(getConfig('alertas_ultimo_uid') || '0', 10) : 0;
      let criterio;
      if (dias || !ultimo) criterio = { since: new Date(Date.now() - (dias || 3) * 864e5) };
      else criterio = { uid: `${ultimo + 1}:*` };
      const uids = (await client.search(criterio, { uid: true })) || [];
      let maior = ultimo;
      for (const uid of uids.slice(-300)) {
        if (uid <= ultimo && !dias) continue;
        maior = Math.max(maior, uid);
        const msg = await client.fetchOne(uid, { uid: true, envelope: true, bodyStructure: true, internalDate: true, headers: ['from', 'authentication-results', 'subject'] }, { uid: true });
        if (!msg) continue;
        const h = cabecalhos(msg.headers);
        const portal = remetenteConfiavel(h);
        if (!portal) { r.ignorados++; log(`ignorado (não é alerta de portal verificado): ${dominioDe(h.from) || '?'} · "${limpa(msg.envelope?.subject).slice(0, 60)}"`); continue; }
        r.emails++;
        const partes = []; (function anda(n) { if (!n) return; if (n.childNodes) n.childNodes.forEach(anda); else partes.push(n); })(msg.bodyStructure);
        const parteHtml = partes.find((p) => p.type === 'text/html') || partes.find((p) => p.type === 'text/plain');
        if (!parteHtml) continue;
        const { meta, content } = await client.download(uid, parteHtml.part || '1', { uid: true, maxBytes: 3 * 1024 * 1024 });
        const chunks = []; for await (const c of content) chunks.push(c);
        let corpo; try { corpo = new TextDecoder(meta.charset || 'utf-8').decode(Buffer.concat(chunks)); } catch { corpo = Buffer.concat(chunks).toString('utf8'); }
        const quando = new Date(msg.internalDate || Date.now()).toISOString().slice(0, 10);
        let anuncios = await anunciosDoEmail(parteHtml.type === 'text/html' ? corpo : null, corpo, portal);
        log(`${portal.nome}: "${limpa(msg.envelope?.subject).slice(0, 80)}" -> ${anuncios.length} anúncio(s)`);
        if (!testar) anotaPortal(portal.nome, new Date(msg.internalDate || Date.now()).toISOString(), anuncios.length, /bem-vind|boas-vindas|bom ter voc|confirm/i.test(limpa(msg.envelope?.subject)));
        for (let a of anuncios) {
          r.anuncios++;
          if ((!a.valor || !a.titulo || !a.bairro) && usaIA !== false) {
            if (usaIA === null) usaIA = (await ia.disponivel()).instalado === true;
            if (usaIA) a = await completaComIA(a);
          }
          if (testar) { r.encontrados.push(a); continue; }
          const res = registra(a, quando);
          if (res === 'nova') r.novas++; else if (res === 'preco') r.precos++; else r.repetidos++;
        }
      }
      if (!testar) { setConfig('alertas_uidvalidity', validade); setConfig('alertas_ultimo_uid', String(maior)); }
    } finally { lock.release(); }
    r.ok = true;
  } catch (e) {
    r.erro = e.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials/i.test(String(e.responseText || e.message))
      ? 'O Gmail recusou o login. Confira o e-mail e a senha de app (16 letras) no .env.'
      : /CONNECT_TIMEOUT|GREETING_TIMEOUT|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/.test(String(e.code || e.message))
        ? 'Não consegui conectar ao Gmail (imap.gmail.com). Confira a internet ou se o antivírus/firewall bloqueia a porta 993.'
        : /Mailbox doesn't exist|NONEXISTENT/i.test(String(e.responseText || e.message))
          ? `A pasta "${cfg.RADAR_EMAIL_PASTA}" não existe no Gmail. Confira RADAR_EMAIL_PASTA no .env.`
          : `Falha ao ler o e-mail: ${e.message}`;
  } finally {
    try { await client.logout(); } catch { /* já fechado */ }
  }
  if (!testar) {
    const { encontrados, ...resumo } = r;
    salvaStatus(resumo);
    if (r.novas || r.precos) audit(null, 'radar_alertas', `${r.novas} nova(s), ${r.precos} queda(s) de preço`);
  }
  return r;
}

let timer = null;
function iniciar() {
  if (!configurado() || timer) return;
  if (!getConfig('alertas_inicio')) setConfig('alertas_inicio', new Date().toISOString());
  const roda = () => ler().catch(() => { /* erro fica no status */ });
  setTimeout(roda, 20000);
  timer = setInterval(roda, intervaloMin() * 60000);
  timer.unref?.();
  console.log(`  Radar automático: lendo ${cfg.RADAR_EMAIL} a cada ${intervaloMin()} min.`);
}

module.exports = { configurado, status, saude, anotaPortal, ler, iniciar, anunciosDoEmail, extraiCampos, remetenteConfiavel, cabecalhos, registra, PORTAIS };
