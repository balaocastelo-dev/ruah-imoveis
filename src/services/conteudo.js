// Conteúdo dos arquivos (fotos e documentos).
// Banco online: o arquivo fica no próprio Postgres (tabela arquivos_dados), visível no PC e no link.
// Banco local: fica na pasta data/arquivos do PC, como sempre foi.
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { one, run, PG } = require('../db');

function ler(a) {
  if (!a) return null;
  if (PG) {
    const r = one('SELECT dados FROM arquivos_dados WHERE arquivo_id=?', a.id);
    if (r) return r.dados;
  }
  if (!a.caminho_local) return null;
  const p = path.join(cfg.DATA_DIR, a.caminho_local);
  if (!p.startsWith(cfg.DATA_DIR) || !fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

function gravar(arquivoId, buffer) {
  run('INSERT INTO arquivos_dados(arquivo_id,dados) VALUES(?,?) ON CONFLICT(arquivo_id) DO UPDATE SET dados=excluded.dados', arquivoId, buffer);
}

module.exports = { ler, gravar, PG };
