// Carrega o arquivo .env (sem dependências externas) e expõe a configuração.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const envPath = path.join(ROOT, '.env');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const env = (k, d = '') => (process.env[k] ?? d).trim();

const PORT = parseInt(env('PORT', '3333'), 10);

module.exports = {
  ROOT,
  DATA_DIR: path.join(ROOT, 'data'),
  PORT,
  BASE_URL: env('BASE_URL', `http://localhost:${PORT}`),
  PUBLIC_URL: env('PUBLIC_URL', ''), // URL pública (túnel) para links de assinatura, off-market e webhook
  SECRET_KEY: env('SECRET_KEY'),
  EMPRESA: env('EMPRESA', 'RUAH Investimentos Imobiliários'),
  CIDADE_PADRAO: env('CIDADE_PADRAO', 'Campinas'),
  UF_PADRAO: env('UF_PADRAO', 'SP'),

  // Google Drive
  GOOGLE_CLIENT_ID: env('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: env('GOOGLE_CLIENT_SECRET'),
  DRIVE_ROOT_FOLDER_ID: env('DRIVE_ROOT_FOLDER_ID'), // opcional: ID de uma pasta ou Drive compartilhado
  DRIVE_ROOT_NAME: env('DRIVE_ROOT_NAME', 'RUAH Imóveis'),

  // WhatsApp Cloud API (oficial)
  WA_TOKEN: env('WA_TOKEN'),
  WA_PHONE_ID: env('WA_PHONE_ID'),
  WA_VERIFY_TOKEN: env('WA_VERIFY_TOKEN'),
  WA_APP_SECRET: env('WA_APP_SECRET'),
  // Número de WhatsApp da RUAH impresso no QR code das cartas (com DDD). Vazio = usa o celular do corretor.
  WHATSAPP_RUAH: env('WHATSAPP_RUAH'),
  CUSTO_MATRICULA: parseFloat(env('CUSTO_MATRICULA', '0')) || 0,
  CUSTO_BIRO: parseFloat(env('CUSTO_BIRO', '0')) || 0,

  // Radar automático: e-mail que recebe os alertas de busca dos portais (Gmail com senha de app)
  RADAR_EMAIL: env('RADAR_EMAIL'),
  RADAR_EMAIL_SENHA: env('RADAR_EMAIL_SENHA'),
  RADAR_EMAIL_PASTA: env('RADAR_EMAIL_PASTA', 'INBOX'),
  RADAR_INTERVALO_MIN: env('RADAR_INTERVALO_MIN', '10'),

  // IA local (Ollama)
  OLLAMA_URL: env('OLLAMA_URL', 'http://127.0.0.1:11434'),
  OLLAMA_MODEL: env('OLLAMA_MODEL', 'qwen3:14b'),
  IA_MODO: env('IA_MODO', 'sugerir'), // desligado | sugerir | automatico
};
