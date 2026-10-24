// Carta ao proprietário: PDF A4 com QR code que abre o WhatsApp da RUAH já com a referência do imóvel.
// Não precisa do nome do dono: vai endereçada ao "proprietário(a)" da unidade. Quem responde, responde por vontade própria.
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const cfg = require('../config');

const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const telWa = (t) => { const d = soDigitos(t); return d ? (d.startsWith('55') ? d : '55' + d) : ''; };
const ref = (op) => `OP-${String(op.id).padStart(4, '0')}`;
const enderecoLinha = (op) => [op.logradouro, op.numero].filter(Boolean).join(', ') + (op.unidade ? ` – ${op.unidade}` : '');

function linkWhatsapp(op, telefone) {
  const n = telWa(telefone);
  if (!n) return null;
  const txt = `Olá! Recebi a carta da RUAH sobre o imóvel ${enderecoLinha(op) || op.condominio_nome || ''} (ref. ${ref(op)}). Gostaria de conversar sobre a venda.`;
  return `https://wa.me/${n}?text=${encodeURIComponent(txt)}`;
}

async function paginaCarta(doc, op, corretor) {
  const ouro = '#8a6a2c';
  const telefone = cfg.WHATSAPP_RUAH || (corretor && corretor.telefone);
  const link = linkWhatsapp(op, telefone);
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;

  doc.fillColor(ouro).font('Helvetica-Bold').fontSize(20).text('RUAH', L, 56, { characterSpacing: 4 });
  doc.fillColor('#555').font('Helvetica').fontSize(9).text(cfg.EMPRESA);
  doc.moveDown(2.2);

  doc.fillColor('#111').font('Helvetica-Bold').fontSize(11).text('Ao(À) Proprietário(a)');
  doc.font('Helvetica').fontSize(11).text(enderecoLinha(op) || '—');
  if (op.condominio_nome) doc.text(op.condominio_nome);
  doc.text([op.bairro, op.cidade || cfg.CIDADE_PADRAO].filter(Boolean).join(' – '));
  doc.moveDown(1.6);

  const p = (t) => { doc.font('Helvetica').fontSize(11).fillColor('#222').text(t, { align: 'justify', lineGap: 3 }); doc.moveDown(0.7); };
  p('Prezado(a) proprietário(a),');
  p(`Somos a ${cfg.EMPRESA}, imobiliária de Campinas especializada em venda de imóveis. Temos clientes ativos procurando imóveis${op.condominio_nome ? ' no ' + op.condominio_nome : op.bairro ? ' em ' + op.bairro : ' na sua região'} e gostaríamos de conversar com você sobre o seu.`);
  p('Se você pensa em vender, agora ou mais para frente, fazemos uma avaliação gratuita, sem compromisso, e mostramos quanto imóveis parecidos estão valendo na região. Cuidamos da divulgação, das visitas e de toda a documentação até a escritura.');
  p('Se não for proprietário(a) ou não tiver interesse, por favor desconsidere esta carta. Não guardamos seus dados sem a sua autorização.');
  doc.moveDown(0.6);

  const y = doc.y;
  if (link) {
    const png = await QRCode.toBuffer(link, { type: 'png', width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1b1c1e', light: '#ffffff' } });
    doc.image(png, L, y, { width: 120 });
  }
  const tx = link ? L + 140 : L;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ouro).text(link ? 'Aponte a câmera do celular' : 'Fale com a RUAH', tx, y + 8, { width: W - (tx - L) });
  doc.font('Helvetica').fontSize(10.5).fillColor('#222').text(link ? 'e fale com a gente direto no WhatsApp. A mensagem já vai com a referência do seu imóvel.' : '', { width: W - (tx - L) });
  doc.moveDown(0.5);
  if (telefone) doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(`WhatsApp: ${formataTel(telefone)}`, { width: W - (tx - L) });
  if (corretor) doc.font('Helvetica').fontSize(10).fillColor('#444').text(`Corretor(a): ${corretor.nome}`, { width: W - (tx - L) });
  doc.font('Helvetica').fontSize(9).fillColor('#777').text(`Referência: ${ref(op)}`, { width: W - (tx - L) });

  doc.font('Helvetica').fontSize(8).fillColor('#888').text('Não quer receber contato da RUAH? Envie PARAR para o WhatsApp acima e o seu endereço sai da nossa lista.',
    L, doc.page.height - doc.page.margins.bottom - 24, { width: W, align: 'center' });
}
function formataTel(t) { const d = soDigitos(t).replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; }

// Uma ou várias cartas no mesmo PDF (para imprimir em lote).
function pdfCartas(itens) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 64, right: 64 }, autoFirstPage: false, info: { Title: 'Cartas ao proprietário', Author: cfg.EMPRESA } });
      const partes = []; doc.on('data', (c) => partes.push(c)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);
      for (const { op, corretor } of itens) { doc.addPage(); await paginaCarta(doc, op, corretor); }
      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { pdfCartas, linkWhatsapp, ref };
