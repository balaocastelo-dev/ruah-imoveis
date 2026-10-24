// Ferramenta de conferência do radar automático (não precisa do sistema aberto).
//   node ler-alertas.js --testar            mostra o que encontraria nos alertas dos últimos 3 dias, sem gravar
//   node ler-alertas.js --testar --dias 7   idem, últimos 7 dias
//   node ler-alertas.js                     lê de verdade e grava no radar (o mesmo que o botão "Ler agora")
const al = require('./src/services/alertas');
const args = process.argv.slice(2);
const testar = args.includes('--testar');
const dias = parseInt(args[args.indexOf('--dias') + 1], 10) || null;

(async () => {
  if (!al.configurado()) { console.log('Configure RADAR_EMAIL e RADAR_EMAIL_SENHA no arquivo .env.'); process.exit(1); }
  console.log(`${testar ? 'TESTE (não grava)' : 'Lendo e gravando'} · ${dias || (testar ? 3 : 'novos')} ${dias || testar ? 'dias' : ''}\n`);
  const r = await al.ler({ testar, dias: dias || (testar ? 3 : null), log: (m) => console.log('  ' + m) });
  if (r.erro) { console.log('\nERRO: ' + r.erro); process.exit(1); }
  if (testar) for (const a of r.encontrados) {
    console.log(`\n- [${a.portal}] ${a.titulo || '(sem título)'}\n  ${a.link}\n  ${a.tipo || '?'} · ${a.bairro || '?'}, ${a.cidade || '?'} · ${a.valor ? 'R$ ' + a.valor.toLocaleString('pt-BR') : 'sem valor'} · ${a.quartos || '?'} quartos · ${a.area || '?'} m² · ${a.anunciante_tipo}`);
  }
  console.log(`\nAlertas de portal: ${r.emails} · outros e-mails ignorados: ${r.ignorados} · anúncios: ${r.anuncios}${testar ? '' : ` · novas: ${r.novas} · quedas de preço: ${r.precos} · repetidos: ${r.repetidos}`}`);
  process.exit(0);
})();
