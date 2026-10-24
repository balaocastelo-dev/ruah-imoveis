const { one } = require('./db');
const { veTudo } = require('./auth');

class Erro extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const falha = (status, msg) => { throw new Erro(status, msg); };

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/\./g, '').replace(',', '.')) || null);
const int = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10));
const txt = (v, max = 500) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

function imovelPermitido(u, id) {
  const im = one('SELECT * FROM imoveis WHERE id=?', id);
  if (!im) falha(404, 'Imóvel não encontrado.');
  if (!veTudo(u) && im.corretor_id !== u.id) falha(403, 'Este imóvel é de outro corretor.');
  return im;
}
function leadPermitido(u, id) {
  const l = one('SELECT * FROM leads WHERE id=?', id);
  if (!l) falha(404, 'Lead não encontrado.');
  if (!veTudo(u) && l.corretor_id !== u.id) falha(403, 'Este lead é de outro corretor.');
  return l;
}

function cpfValido(cpf) {
  const c = String(cpf || '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}
const fmtCpf = (c) => String(c).replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const brl = (v) => (v || v === 0 ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');

module.exports = { Erro, falha, num, int, txt, imovelPermitido, leadPermitido, cpfValido, fmtCpf, brl };
