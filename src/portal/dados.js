// Portal RUAH · os imóveis à venda, lidos do banco AO VIVO.
//
// Entra no portal o imóvel com status "publicado" e ao menos uma foto. Nunca
// saem daqui: endereço (rua, número, unidade, CEP, coordenadas), proprietário,
// documentos nem nada do CRM. A "versão" resume o que a página escrita usou
// (tipo, lugar, números, descrição do anúncio e as fotos): quando muda, a
// página entra na fila para ser reescrita. O preço NÃO entra na versão: ele
// aparece sempre da ficha, ao vivo, e muda sem precisar reescrever nada.

const crypto = require('crypto');
const cfg = require('../config');
const { one, all } = require('../db');

const CAMPOS = `i.id, i.codigo, i.tipo, i.bairro, i.cidade, i.uf, i.quartos, i.suites, i.vagas, i.area_util, i.area_total,
  i.valor, i.valor_condominio, i.iptu, i.descricao, i.criado_em, i.atualizado_em,
  c.nome condominio, c.lazer, u.nome corretor_nome, u.telefone corretor_tel, u.perfil corretor_perfil`;

function versaoDe(i, fotos) {
  const base = JSON.stringify([i.tipo, i.bairro, i.cidade, i.condominio, i.lazer, i.quartos, i.suites, i.vagas, i.area_util, i.area_total, (i.descricao || '').trim(), fotos]);
  return crypto.createHash('sha256').update(base).digest('hex').slice(0, 12);
}

function montar(i, fotos) {
  const area = (v) => (Number(v) > 0 ? Number(v) : null);
  const im = {
    id: i.id, codigo: i.codigo, tipo: i.tipo, bairro: i.bairro || null, cidade: i.cidade || cfg.CIDADE_PADRAO, uf: i.uf || cfg.UF_PADRAO,
    condominio: i.condominio && !/\(exemplo\)/i.test(i.condominio) ? i.condominio : null, lazer: i.lazer || null,
    quartos: i.quartos ?? null, suites: i.suites ?? null, vagas: i.vagas ?? null, area_util: area(i.area_util), area_total: area(i.area_total),
    valor: Number(i.valor) > 0 ? Number(i.valor) : null, valor_condominio: Number(i.valor_condominio) > 0 ? Number(i.valor_condominio) : null,
    iptu: Number(i.iptu) > 0 ? Number(i.iptu) : null, descricao: i.descricao || '',
    fotos, criado_em: i.criado_em, atualizado_em: i.atualizado_em,
    // Corretor só aparece com nome se é corretor de verdade e tem telefone; senão, "Equipe RUAH".
    corretor: i.corretor_perfil === 'corretor' && i.corretor_tel ? { nome: i.corretor_nome, telefone: i.corretor_tel } : null,
  };
  im.versao = versaoDe(im, fotos);
  return im;
}

/** Todos os imóveis à venda com foto, do mais novo para o mais antigo. */
function imoveisAVenda() {
  const linhas = all(`SELECT ${CAMPOS} FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id LEFT JOIN usuarios u ON u.id=i.corretor_id
    WHERE i.status='publicado' ORDER BY i.id DESC`);
  if (!linhas.length) return [];
  const fotos = new Map();
  for (const f of all(`SELECT f.id, f.imovel_id FROM arquivos f JOIN imoveis i ON i.id=f.imovel_id
      WHERE i.status='publicado' AND f.categoria='Fotos' AND f.mime LIKE 'image/%' ORDER BY f.imovel_id, f.id`)) {
    if (!fotos.has(f.imovel_id)) fotos.set(f.imovel_id, []);
    fotos.get(f.imovel_id).push(f.id);
  }
  return linhas.filter((i) => fotos.has(i.id)).map((i) => montar(i, fotos.get(i.id)));
}

/** Um imóvel à venda pelo código, ou null. */
function imovelAVenda(codigo) {
  const i = one(`SELECT ${CAMPOS} FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id LEFT JOIN usuarios u ON u.id=i.corretor_id
    WHERE i.codigo=? AND i.status='publicado'`, String(codigo));
  if (!i) return null;
  const fotos = all("SELECT id FROM arquivos WHERE imovel_id=? AND categoria='Fotos' AND mime LIKE 'image/%' ORDER BY id", i.id).map((f) => f.id);
  return fotos.length ? montar(i, fotos) : null;
}

/** A foto, só se for de um imóvel à venda. */
function fotoPublica(id) {
  return one(`SELECT f.* FROM arquivos f JOIN imoveis i ON i.id=f.imovel_id
    WHERE f.id=? AND i.status='publicado' AND f.categoria='Fotos' AND f.mime LIKE 'image/%'`, Number(id)) || null;
}

/** O que a régua precisa da ficha. */
const fichaParaRegua = (im) => im && ({ codigo: im.codigo, tipo: im.tipo, quartos: im.quartos, suites: im.suites, vagas: im.vagas, area_util: im.area_util, area_total: im.area_total, fotos: im.fotos });

module.exports = { imoveisAVenda, imovelAVenda, fotoPublica, fichaParaRegua, versaoDe };
