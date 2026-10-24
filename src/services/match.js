// Match comprador × imóvel: pontua o quanto cada imóvel atende ao que o lead procura.
const { all, one } = require('../db');

// capa (primeira foto) e quantidade de fotos, para os cards
function fotosDe(imovelId) {
  return one("SELECT min(id) capa, count(*) n_fotos FROM arquivos WHERE imovel_id=? AND categoria='Fotos' AND mime LIKE 'image/%'", imovelId) || { capa: null, n_fotos: 0 };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const listaBairros = (s) => String(s || '').split(/[,;]/).map(norm).filter(Boolean);

function pontua(lead, im) {
  let pontos = 0, max = 0; const motivos = [];
  if (lead.valor_max) {
    max += 40;
    if (im.valor && im.valor <= lead.valor_max) { pontos += 40; motivos.push('cabe na verba'); }
    else if (im.valor && im.valor <= lead.valor_max * 1.08) { pontos += 20; motivos.push('até 8% acima da verba'); }
    else return null;
  }
  if (lead.quartos_min) { max += 20; if ((im.quartos || 0) >= lead.quartos_min) { pontos += 20; motivos.push(`${im.quartos} quartos`); } else return null; }
  if (lead.vagas_min) { max += 15; if ((im.vagas || 0) >= lead.vagas_min) { pontos += 15; motivos.push(`${im.vagas} vagas`); } else pontos += 0; }
  if (lead.tipo_desejado) { max += 15; if (norm(im.tipo).includes(norm(lead.tipo_desejado)) || norm(lead.tipo_desejado).includes(norm(im.tipo))) { pontos += 15; motivos.push(im.tipo); } }
  const bs = listaBairros(lead.bairros);
  if (bs.length) { max += 10; if (bs.some((b) => norm(im.bairro).includes(b) || norm(im.condominio_nome).includes(b))) { pontos += 10; motivos.push(im.bairro); } }
  if (!max) return null;
  return { score: Math.round((pontos / max) * 100), motivos };
}

const SQL_IMOVEIS = `SELECT i.*, c.nome condominio_nome, u.nome corretor_nome FROM imoveis i
  LEFT JOIN condominios c ON c.id=i.condominio_id LEFT JOIN usuarios u ON u.id=i.corretor_id
  WHERE i.status IN ('publicado','off_market','captacao')`;

function imoveisParaLead(leadId, limite = 8) {
  const lead = one('SELECT * FROM leads WHERE id=?', leadId);
  if (!lead) return [];
  return all(SQL_IMOVEIS).map((im) => ({ im, m: pontua(lead, im) })).filter((x) => x.m && x.m.score >= 50)
    .sort((a, b) => b.m.score - a.m.score).slice(0, limite)
    .map(({ im, m }) => ({ id: im.id, codigo: im.codigo, tipo: im.tipo, condominio: im.condominio_nome, condominio_nome: im.condominio_nome, bairro: im.bairro, cidade: im.cidade, valor: im.valor, quartos: im.quartos, suites: im.suites, vagas: im.vagas, area_util: im.area_util, status: im.status, exclusivo: im.exclusivo, corretor_nome: im.corretor_nome, ...fotosDe(im.id), score: m.score, motivos: m.motivos }));
}

function leadsParaImovel(imovelId, limite = 10) {
  const im = one(`SELECT i.*, c.nome condominio_nome FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id WHERE i.id=?`, imovelId);
  if (!im) return [];
  return all(`SELECT l.*, u.nome corretor_nome FROM leads l LEFT JOIN usuarios u ON u.id=l.corretor_id WHERE l.etapa NOT IN ('escritura','perdido')`)
    .map((l) => ({ l, m: pontua(l, im) })).filter((x) => x.m && x.m.score >= 50)
    .sort((a, b) => b.m.score - a.m.score).slice(0, limite)
    .map(({ l, m }) => ({ id: l.id, nome: l.nome, busca: l.busca, etapa: l.etapa, corretor_id: l.corretor_id, corretor: l.corretor_nome, score: m.score, motivos: m.motivos }));
}

module.exports = { fotosDe, imoveisParaLead, leadsParaImovel, pontua };
