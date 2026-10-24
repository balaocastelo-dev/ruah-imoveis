// Gera o PDF da autorização assinada, com a página de trilha de auditoria.
const PDFDocument = require('pdfkit');
const cfg = require('../config');

function pdfAutorizacao(a) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 64, right: 64 }, info: { Title: 'Autorização de venda', Author: cfg.EMPRESA } });
    const partes = []; doc.on('data', (c) => partes.push(c)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject);
    const ouro = '#8a6a2c';

    doc.fillColor(ouro).font('Helvetica-Bold').fontSize(16).text('RUAH', { characterSpacing: 3 });
    doc.fillColor('#555').font('Helvetica').fontSize(9).text(cfg.EMPRESA);
    doc.moveDown(1.2);

    const linhas = a.conteudo.split('\n');
    doc.fillColor('#111');
    linhas.forEach((l, i) => {
      if (i === 0) { doc.font('Helvetica-Bold').fontSize(13).text(l, { align: 'center' }); doc.moveDown(0.8); return; }
      if (!l.trim()) { doc.moveDown(0.5); return; }
      const m = l.match(/^((?:\d+\. )?[A-ZÇÃÁÉÍÓÚÂÊÔ() ]{4,}:)(.*)$/);
      doc.fontSize(10.5);
      if (m) doc.font('Helvetica-Bold').text(m[1], { continued: true, align: 'justify', lineGap: 2 }).font('Helvetica').text(m[2], { align: 'justify', lineGap: 2 });
      else doc.font('Helvetica').text(l, { align: 'justify', lineGap: 2 });
    });

    doc.moveDown(1.5);
    if (a.assinatura_png) {
      const img = Buffer.from(a.assinatura_png.replace(/^data:image\/png;base64,/, ''), 'base64');
      doc.image(img, { fit: [220, 80] });
    }
    doc.moveTo(doc.x, doc.y + 2).lineTo(doc.x + 260, doc.y + 2).strokeColor('#999').stroke();
    doc.moveDown(0.4).font('Helvetica').fontSize(10).text(`${a.assinante_nome} · CPF ${a.assinante_cpf}`);
    doc.fontSize(9).fillColor('#555').text(`Assinado eletronicamente em ${a.assinado_em}`);

    doc.addPage();
    doc.fillColor(ouro).font('Helvetica-Bold').fontSize(13).text('Trilha de auditoria da assinatura');
    doc.moveDown(0.8).fillColor('#111').font('Helvetica').fontSize(10);
    const campos = [
      ['Documento', 'Autorização de venda'], ['Imóvel', a.imovel_codigo], ['Identificador', `ASS-${a.id} · ${a.token.slice(0, 8)}…`],
      ['Assinante', a.assinante_nome], ['CPF informado', a.assinante_cpf], ['Data e hora', a.assinado_em],
      ['Endereço IP', a.ip], ['Navegador', a.user_agent],
      ['Hash SHA-256 do texto', a.conteudo_hash], ['Método', 'Assinatura eletrônica simples (link individual + aceite + assinatura desenhada), conforme MP 2.200-2/2001, art. 10, § 2º.'],
    ];
    campos.forEach(([k, v]) => { doc.font('Helvetica-Bold').text(k, { continued: true }).font('Helvetica').text(`: ${v || '—'}`); doc.moveDown(0.3); });
    doc.moveDown(1).fontSize(8.5).fillColor('#666').text('Para conferir a integridade, compare o hash acima com o hash do texto gravado no Sistema RUAH. Qualquer alteração no texto gera um hash diferente.');
    doc.end();
  });
}

module.exports = { pdfAutorizacao };
