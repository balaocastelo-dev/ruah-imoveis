// Banco SQLite embutido no Node (node:sqlite). Nenhum programa extra para instalar.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(process.env.RUAH_DB || path.join(DATA_DIR, 'ruah.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  telefone TEXT,
  perfil TEXT NOT NULL CHECK (perfil IN ('adm','gestor','corretor')),
  senha_hash TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tentativas_login (
  chave TEXT PRIMARY KEY, falhas INTEGER NOT NULL, bloqueado_ate INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT);

CREATE TABLE IF NOT EXISTS condominios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  cep TEXT, logradouro TEXT, numero TEXT, bairro TEXT, cidade TEXT, uf TEXT,
  ano_construcao TEXT, lazer TEXT, administradora TEXT,
  lat REAL, lon REAL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cond_end ON condominios(cep, numero);

CREATE TABLE IF NOT EXISTS proprietarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL, cpf TEXT, telefone TEXT, email TEXT,
  origem_dado TEXT NOT NULL DEFAULT 'Informado pelo proprietário',
  nao_contatar INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS imoveis (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'captacao'
    CHECK (status IN ('captacao','aguardando_autorizacao','publicado','off_market','vendido','suspenso')),
  cep TEXT, logradouro TEXT, numero TEXT, unidade TEXT, bairro TEXT, cidade TEXT, uf TEXT,
  lat REAL, lon REAL,
  condominio_id INTEGER REFERENCES condominios(id),
  quartos INTEGER, suites INTEGER, vagas INTEGER,
  area_util REAL, area_total REAL,
  valor REAL, valor_condominio REAL, iptu REAL,
  descricao TEXT,
  exclusivo INTEGER NOT NULL DEFAULT 0, exclusivo_ate TEXT,
  corretor_id INTEGER REFERENCES usuarios(id),
  proprietario_id INTEGER REFERENCES proprietarios(id),
  drive_pasta_id TEXT,
  drive_subpastas TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS arquivos (
  id INTEGER PRIMARY KEY,
  imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  nome TEXT NOT NULL,
  mime TEXT, tamanho INTEGER,
  caminho_local TEXT,
  drive_id TEXT, drive_link TEXT,
  enviado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS links_internos (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  mostrar_endereco INTEGER NOT NULL DEFAULT 0,
  expira_em TEXT NOT NULL,
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS links_acessos (
  id INTEGER PRIMARY KEY,
  link_id INTEGER NOT NULL REFERENCES links_internos(id) ON DELETE CASCADE,
  ip TEXT, user_agent TEXT,
  em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT, email TEXT,
  origem TEXT,
  etapa TEXT NOT NULL DEFAULT 'novo'
    CHECK (etapa IN ('novo','qualificado','visita','proposta','escritura','perdido')),
  temperatura TEXT NOT NULL DEFAULT 'morno' CHECK (temperatura IN ('quente','morno','frio')),
  corretor_id INTEGER REFERENCES usuarios(id),
  busca TEXT,
  tipo_desejado TEXT, quartos_min INTEGER, vagas_min INTEGER, valor_max REAL, bairros TEXT,
  nao_contatar INTEGER NOT NULL DEFAULT 0,
  ultimo_contato TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_leads_tel ON leads(telefone);

CREATE TABLE IF NOT EXISTS interacoes (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  texto TEXT,
  autor_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS visitas (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  corretor_id INTEGER REFERENCES usuarios(id),
  data_hora TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','confirmada','realizada','cancelada')),
  avaliacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada','saida','sugestao')),
  texto TEXT NOT NULL,
  status TEXT,
  wa_id TEXT,
  autor TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_msg_lead ON mensagens(lead_id);

CREATE TABLE IF NOT EXISTS assinaturas (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'autorizacao_venda',
  conteudo TEXT NOT NULL,
  conteudo_hash TEXT NOT NULL,
  prazo_dias INTEGER, comissao_pct REAL, exclusivo INTEGER,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','assinado','cancelado')),
  assinante_nome TEXT, assinante_cpf TEXT,
  assinatura_png TEXT,
  ip TEXT, user_agent TEXT, assinado_em TEXT,
  pdf_arquivo_id INTEGER REFERENCES arquivos(id),
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ===== Fase 2: radar de captação =====
CREATE TABLE IF NOT EXISTS oportunidades (
  id INTEGER PRIMARY KEY,
  portal TEXT, link TEXT, titulo TEXT,
  tipo TEXT, bairro TEXT, logradouro TEXT, numero TEXT, unidade TEXT, condominio_nome TEXT, cidade TEXT,
  quartos INTEGER, vagas INTEGER, area REAL,
  valor REAL, valor_anterior REAL,
  anunciante_tipo TEXT NOT NULL DEFAULT 'particular' CHECK (anunciante_tipo IN ('particular','imobiliaria','desconhecido')),
  anunciante_nome TEXT, telefone_anuncio TEXT,
  publicado_em TEXT,
  status TEXT NOT NULL DEFAULT 'nova'
    CHECK (status IN ('nova','em_contato','carta_enviada','aguardando_aprovacao','captada','descartada')),
  motivo_descarte TEXT,
  corretor_id INTEGER REFERENCES usuarios(id),
  titular_nome TEXT, titular_telefone TEXT, titular_origem TEXT,
  matricula_numero TEXT, cartorio TEXT,
  carta_enviada_em TEXT,
  observacoes TEXT,
  imovel_id INTEGER REFERENCES imoveis(id),
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_op_status ON oportunidades(status);
CREATE TABLE IF NOT EXISTS oportunidade_eventos (
  id INTEGER PRIMARY KEY,
  oportunidade_id INTEGER NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL,
  texto TEXT,
  custo REAL NOT NULL DEFAULT 0,
  autor_id INTEGER REFERENCES usuarios(id),
  em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS aprovacoes (
  id INTEGER PRIMARY KEY,
  oportunidade_id INTEGER NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('matricula','biro')),
  custo_estimado REAL,
  justificativa TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','negada')),
  solicitado_por INTEGER REFERENCES usuarios(id),
  decidido_por INTEGER REFERENCES usuarios(id),
  decidido_em TEXT, motivo TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER, acao TEXT NOT NULL, detalhe TEXT,
  em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function getConfig(k) { const r = one('SELECT valor FROM config WHERE chave=?', k); return r ? r.valor : null; }
function setConfig(k, v) {
  if (v === null || v === undefined) return run('DELETE FROM config WHERE chave=?', k);
  run('INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor', k, String(v));
}
function audit(usuarioId, acao, detalhe) {
  run('INSERT INTO auditoria(usuario_id,acao,detalhe) VALUES(?,?,?)', usuarioId ?? null, acao, detalhe ? String(detalhe).slice(0, 1000) : null);
}

module.exports = { db, one, all, run, getConfig, setConfig, audit };
