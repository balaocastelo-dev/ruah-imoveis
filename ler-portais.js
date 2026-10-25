// Conferência do monitor direto dos portais.
//   node ler-portais.js --testar   -> mostra o que encontraria (abre só 5 anúncios), sem gravar
//   node ler-portais.js            -> roda uma busca de verdade (igual à automática)
const testar = process.argv.includes('--testar');
const portais = require('./src/services/portais');
(async () => {
  console.log(testar ? 'TESTE (não grava)\n' : 'BUSCA\n');
  const r = await portais.ler({ testar, log: (t) => console.log('  ' + t) });
  for (const a of r.encontrados || []) console.log(`  · ${a.titulo} | ${a.bairro} | ${a.valor ? 'R$ ' + a.valor.toLocaleString('pt-BR') : 's/ valor'} | ${a.anunciante_tipo}\n    ${a.link}`);
  console.log(`\nAnúncios lidos: ${r.lidos} · Campinas: ${r.campinas} · nos bairros da RUAH: ${r.alvo} · novas: ${r.novas} · na fila: ${r.fila}${r.erro ? '\nERRO: ' + r.erro : ''}`);
  process.exit(r.erro ? 1 : 0);
})();
