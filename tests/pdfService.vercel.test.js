const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const pdfService = require('../api/lib/pdfService');

test('signPdfBuffer devuelve un PDF válido en memoria para Vercel', async () => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([300, 200]);
  const input = Buffer.from(await pdfDoc.save());

  const signed = await pdfService.signPdfBuffer(input, '', {
    position: { x: 12, y: 12, width: 80, height: 30 }
  });

  assert.ok(Buffer.isBuffer(signed), 'Debe devolver un Buffer');
  assert.ok(signed.length > 0, 'Debe generar contenido PDF no vacío');
  assert.match(signed.toString('ascii', 0, 8), /^%PDF/);
});
