// Teste do vigia do radar: avisa quando os portais ficam em silêncio ou a leitura para. node test/vigia.js
const path = require('path'); const os = require('os'); const fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-vg-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.RADAR_EMAIL = 'teste@gmail.com'; process.env.RADAR_EMAIL_SENHA = 'x'; process.env.IA_MODO = 'desligado';
const assert = require('assert');
const al = require('../src/services/alertas');
const { setConfig } = require('../src/db');
const h = (n) => new Date(Date.now() - n * 36e5).toISOString();

setConfig('alertas_inicio', h(2)); setConfig('alertas_status', JSON.stringify({ em: h(0), ok: true }));
assert.equal(al.status().saude.ok, true, 'recém-ligado não alarma');

setConfig('alertas_inicio', h(30));
let s = al.status().saude; assert.equal(s.ok, false); assert.equal(s.problemas[0].tipo, 'silencio'); console.log('ok · 30 h sem alerta desde que ligou:', s.problemas[0].texto);

setConfig('alertas_por_portal', JSON.stringify({ 'ZAP Imóveis': { ultimo: h(3), emails: 5, vazios: 0 } }));
assert.equal(al.status().saude.ok, true, 'alerta recente: tudo certo'); console.log('ok · alerta recente não alarma');

setConfig('alertas_por_portal', JSON.stringify({ 'ZAP Imóveis': { ultimo: h(1), emails: 5, vazios: 3 } }));
assert.equal(al.status().saude.problemas[0].tipo, 'leitura'); console.log('ok · e-mails sem anúncio avisam formato mudado');

setConfig('alertas_por_portal', '{}'); setConfig('alertas_inicio', h(1)); setConfig('alertas_status', JSON.stringify({ em: h(2), ok: true }));
assert.equal(al.status().saude.problemas[0].tipo, 'parado'); console.log('ok · leitura parada avisa');

setConfig('alertas_status', JSON.stringify({ em: h(0), ok: false, erro: 'O Gmail recusou o login.' }));
assert.equal(al.status().saude.problemas[0].tipo, 'erro'); console.log('ok · erro de login avisa');
console.log('\nVIGIA: TODOS OS TESTES PASSARAM');
