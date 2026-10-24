# Sistema RUAH

Sistema interno da RUAH Investimentos Imobiliários (Campinas-SP), feito para substituir as funções do Kenlo e do Fisgar. Roda no PC do escritório e na rede local (celular dos corretores).

## O que tem

- **Imóveis**: cadastro inteligente (CEP, mapa, condomínio reconhecido pelo endereço), cards com foto, galeria em tela cheia, arquivos por imóvel em 7 pastas com Google Drive.
- **Autorização de venda** com assinatura eletrônica e PDF com trilha de auditoria.
- **Link off-market** com validade e registro de acessos.
- **CRM**: funil, match comprador × imóvel, visitas.
- **WhatsApp** (API oficial ou modo simulado) com IA local (Ollama) que sugere respostas para o corretor aprovar.
- **Radar de captação**: oportunidades, carta ao proprietário com QR code, consultas pagas só com aprovação, proteção LGPD (não contatar).
- **Radar automático**: lê os alertas de busca da OLX, ZAP, Viva Real, Imovelweb e Chaves na Mão no Gmail do radar e cria as oportunidades sozinho.

## Como rodar

Requer Node.js 22.13 ou mais novo (Windows). Dê dois cliques em `INICIAR-RUAH.ps1` (ou no atalho "Sistema RUAH"). Ele instala os componentes, cria o `.env` com chaves aleatórias, faz backup diário do banco e abre o navegador em http://localhost:3333.

Configuração de Google Drive, WhatsApp, endereço público, IA e radar automático: veja `COMO-CONFIGURAR.txt`.

## Estrutura

- `server.js`: servidor Express (cabeçalhos de segurança, CSP, rotas)
- `src/`: banco (SQLite embutido do Node), autenticação, rotas e serviços (Drive, WhatsApp, IA, PDF, alertas)
- `public/`: aplicativo web sem frameworks
- `test/`: testes (`node test/smoke.js`, `node test/radar.js`, `node test/alertas.js`)

## Segurança

Nunca suba o `.env` nem a pasta `data/`: eles têm as chaves, o banco e os arquivos dos clientes. Os dois já estão no `.gitignore`.
