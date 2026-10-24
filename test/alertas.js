// Teste do leitor de alertas (sem internet e sem Gmail): node test/alertas.js
const path = require('path'); const os = require('os'); const fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ruah-al-'));
process.env.RUAH_DB = path.join(tmp, 't.db');
process.env.IA_MODO = 'desligado';
const assert = require('assert');
const al = require('../src/services/alertas');
const { one, all } = require('../src/db');

(async () => {
  // 1) remetente: só aceita e-mail assinado pelo portal
  const ok = al.remetenteConfiavel(al.cabecalhos('From: OLX <alertas@mail.olx.com.br>\r\nAuthentication-Results: mx.google.com;\r\n dkim=pass header.i=@mail.olx.com.br header.s=s1;\r\n spf=pass smtp.mailfrom=bounce@mail.olx.com.br; dmarc=pass header.from=olx.com.br'));
  assert.equal(ok && ok.nome, 'OLX');
  const falso = al.remetenteConfiavel(al.cabecalhos('From: OLX <alertas@olx.com.br>\r\nAuthentication-Results: mx.google.com; dkim=pass header.i=@golpe.com; spf=fail smtp.mailfrom=x@golpe.com; dmarc=fail'));
  assert.equal(falso, null, 'e-mail falso com remetente OLX deve ser recusado');
  assert.equal(al.remetenteConfiavel(al.cabecalhos('From: Fulano <f@gmail.com>\r\nAuthentication-Results: mx.google.com; dkim=pass header.i=@gmail.com')), null);

  // 2) alerta da OLX (cartões em tabela, link de foto + link de título)
  const olx = `<html><body><table>
   <tr><td><a href="https://sp.olx.com.br/grande-campinas/imoveis/apartamento-3-quartos-no-cambui-1412345678?utm_source=alerta"><img src="https://img.olx.com.br/a.jpg" alt="Apartamento 3 quartos no Cambuí"></a></td>
       <td><a href="https://sp.olx.com.br/grande-campinas/imoveis/apartamento-3-quartos-no-cambui-1412345678?utm_source=alerta">Apartamento 3 quartos no Cambuí - Particular</a>
       <p>R$ 1.250.000</p><p>3 quartos | 120m² | 2 vagas</p><p>Campinas, Cambuí</p><p>Condomínio R$ 1.100</p></td></tr>
   <tr><td><a href="https://sp.olx.com.br/grande-campinas/imoveis/casa-em-condominio-alphaville-1498765432">Casa em condomínio Alphaville 4 suítes</a>
       <p>R$ 4.900.000</p><p>4 quartos · 450 m² · 4 vagas</p><p>Campinas, Alphaville Dom Pedro</p><p>Profissional</p></td></tr>
   <tr><td><a href="https://www.olx.com.br/ajuda">Ajuda</a> <a href="https://www.olx.com.br/descadastrar?x=1">Descadastrar</a></td></tr>
  </table></body></html>`;
  const portal = al.PORTAIS[0];
  const a = await al.anunciosDoEmail(olx, '', portal);
  console.log(a.map(({ texto, ...x }) => x));
  assert.equal(a.length, 2);
  assert.equal(a[0].link, 'https://sp.olx.com.br/grande-campinas/imoveis/apartamento-3-quartos-no-cambui-1412345678');
  assert.equal(a[0].valor, 1250000); assert.equal(a[0].quartos, '3'); assert.equal(a[0].area, 120); assert.equal(a[0].vagas, '2');
  assert.equal(a[0].bairro, 'Cambuí'); assert.equal(a[0].tipo, 'Apartamento'); assert.equal(a[0].anunciante_tipo, 'particular');
  assert.equal(a[1].tipo, 'Casa em condomínio'); assert.equal(a[1].anunciante_tipo, 'imobiliaria'); assert.equal(a[1].bairro, 'Alphaville Dom Pedro');

  // 3) alerta do ZAP (bairro antes da cidade)
  const zap = `<div><a href="https://www.zapimoveis.com.br/imovel/venda-casa-4-quartos-nova-campinas-campinas-sp-300m2-id-2712345678/?source=email">
    <div>Casa com 4 Quartos à venda, 300m²</div></a><div>Nova Campinas, Campinas</div><div>R$ 2.300.000</div><div>4 quartos 3 vagas</div></div>`;
  const z = await al.anunciosDoEmail(zap, '', al.PORTAIS[1]);
  console.log(z.map(({ texto, ...x }) => x));
  assert.equal(z.length, 1); assert.equal(z[0].portal, 'ZAP Imóveis'); assert.equal(z[0].bairro, 'Nova Campinas'); assert.equal(z[0].valor, 2300000); assert.equal(z[0].tipo, 'Casa');

  // 4) gravação: nova, repetida, queda de preço e mesmo imóvel em outro portal
  assert.equal(al.registra(a[0], '2026-10-24'), 'nova');
  assert.equal(al.registra(a[0], '2026-10-24'), 'repetido');
  assert.equal(al.registra({ ...a[0], valor: 1190000 }, '2026-10-25'), 'preco');
  const op = one('SELECT * FROM oportunidades WHERE link=?', a[0].link);
  assert.equal(op.valor, 1190000); assert.equal(op.valor_anterior, 1250000);
  assert.equal(al.registra({ ...a[0], portal: 'ZAP Imóveis', link: 'https://www.zapimoveis.com.br/imovel/x-1', valor: 1190000 }, '2026-10-25'), 'repetido');
  assert.ok(all('SELECT texto FROM oportunidade_eventos WHERE oportunidade_id=?', op.id).some((e) => e.texto.includes('zapimoveis')));
  assert.equal(al.registra(a[1], '2026-10-24'), 'nova');
  assert.ok(all('SELECT texto FROM oportunidade_eventos').some((e) => e.texto.includes('não abordar')));
  console.log('\nOK: leitor de alertas passou em todos os testes.');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
