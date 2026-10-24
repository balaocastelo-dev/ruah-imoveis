// Sistema RUAH · Fase 1 — servidor local.
const path = require('path');
const fs = require('fs');
const express = require('express');
const cfg = require('./src/config');

if (!cfg.SECRET_KEY || cfg.SECRET_KEY.length < 32) {
  console.error('\n[ERRO] SECRET_KEY ausente no arquivo .env. Rode o INICIAR-RUAH.ps1 para gerar a configuração.\n');
  process.exit(1);
}

const { mesmaOrigem, exigeLogin } = require('./src/auth');
const publico = require('./src/routes/publico');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // IP real quando houver túnel local (cloudflared)

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  next();
});

// Webhook do WhatsApp precisa do corpo bruto: vem antes do parser JSON.
app.use('/webhook/whatsapp', publico.webhook);

app.use(express.json({ limit: '1mb' }));
app.use('/api', mesmaOrigem);
app.use('/api/publico', publico);
const ABERTAS = new Set(['/setup', '/login', '/logout', '/drive/callback']);
app.use('/api', (req, res, next) => (ABERTAS.has(req.path) ? next() : exigeLogin(req, res, next)));
app.use('/api', require('./src/routes/arquivos'));
app.use('/api/imoveis', require('./src/routes/imoveis'));
app.use('/api', require('./src/routes/leads'));
app.use('/api', require('./src/routes/radar'));
app.use('/api', require('./src/routes/base'));
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

const PUB = path.join(__dirname, 'public');
app.get('/assinar/:token', (req, res) => res.sendFile(path.join(PUB, 'assinar.html')));
app.get('/v/:token', (req, res) => res.sendFile(path.join(PUB, 'imovel.html')));
app.use(express.static(PUB, { index: 'index.html', maxAge: 0 }));

// Erros: mensagem clara para o usuário, detalhe só no console.
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(new Date().toLocaleString('pt-BR'), req.method, req.originalUrl, err);
  const msg = status === 413 ? 'Arquivo grande demais (limite 25 MB).' : status >= 500 && !err.status ? 'Erro interno. Veja a janela do servidor para detalhes.' : err.message;
  res.status(status).json({ erro: msg });
});

if (require.main === module) {
  const host = process.env.HOST || '0.0.0.0';
  app.listen(cfg.PORT, host, () => {
    const nets = require('os').networkInterfaces();
    const ips = Object.values(nets).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
    console.log('\n  ==============================================');
    console.log('   SISTEMA RUAH  ·  rodando');
    console.log(`   Neste PC:        ${cfg.BASE_URL}`);
    ips.forEach((ip) => console.log(`   Na rede (celular): http://${ip}:${cfg.PORT}`));
    console.log('   Para parar: feche esta janela');
    console.log('  ==============================================\n');
    require('./src/services/alertas').iniciar();
  });
}

module.exports = app;
