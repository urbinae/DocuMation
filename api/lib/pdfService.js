const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const crypto = require('crypto');

/**
 * Valida el formato y el dígito verificador Módulo 11 de un CUIL/CUIT argentino.
 * @param {string} cuil 
 * @returns {boolean}
 */
function isValidCUIL(cuil) {
  if (!cuil) return false;
  const clean = String(cuil).replace(/\D/g, '');
  if (clean.length !== 11) return false;

  const validPrefixes = ['20', '23', '24', '27', '30', '32', '33', '34'];
  const prefix = clean.substring(0, 2);
  if (!validPrefixes.includes(prefix)) return false;

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * multipliers[i];
  }

  const remainder = sum % 11;
  let verifier = 11 - remainder;
  if (verifier === 11) verifier = 0;
  if (verifier === 10) verifier = 9;

  return verifier === parseInt(clean[10], 10);
}

/**
 * Normaliza un CUIL al formato XX-XXXXXXXX-X
 * @param {string} cuil 
 * @returns {string}
 */
function formatCUIL(cuil) {
  const clean = String(cuil).replace(/\D/g, '');
  if (clean.length !== 11) return cuil;
  return `${clean.substring(0, 2)}-${clean.substring(2, 10)}-${clean.substring(10)}`;
}

/**
 * Sanitiza un nombre de archivo/ruta para Supabase Storage (remueve diacríticos/acentos y caracteres especiales)
 * @param {string} filename 
 * @returns {string}
 */
function sanitizeFileName(filename) {
  if (!filename) return 'archivo';
  return String(filename)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Calcula el hash SHA-256 de un Buffer
 * @param {Buffer} buffer 
 * @returns {string} Hash SHA-256 en formato hex
 */
function getBufferHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Extrae texto y metadatos de un Buffer PDF.
 * @param {Buffer} fileBuffer 
 * @param {string} originalFilename 
 * @returns {Promise<{ cuil: string|null, formattedCuil: string|null, type: string, financialData: object, text: string }>}
 */
async function analyzeBuffer(fileBuffer, originalFilename = '') {
  let text = '';
  try {
    const pdfData = await pdfParse(fileBuffer);
    text = pdfData.text || '';
  } catch (err) {
    console.warn('⚠️ Error extrayendo texto con pdf-parse:', err.message);
  }

  // 1. Detección de CUIL
  let detectedCuil = null;
  const cuilRegex = /(?:CUIL|CUIT)?\s*[:.-]?\s*(\d{2}[-.\s]?\d{8}[-.\s]?\d{1}|\d{11})/gi;
  let match;

  while ((match = cuilRegex.exec(text)) !== null) {
    const rawMatch = match[1] || match[0];
    const cleanMatch = rawMatch.replace(/\D/g, '');
    if (isValidCUIL(cleanMatch)) {
      detectedCuil = cleanMatch;
      break;
    }
  }

  // Fallback: Buscar cualquier secuencia de 11 dígitos en el texto o nombre de archivo
  if (!detectedCuil) {
    const fallbackMatches = (text + ' ' + originalFilename).match(/\b\d{11}\b/g) || [];
    for (const raw of fallbackMatches) {
      const cleanMatch = raw.replace(/\D/g, '');
      if (isValidCUIL(cleanMatch)) {
        detectedCuil = cleanMatch;
        break;
      }
    }
  }

  // 2. Determinación de Tipo (Original vs Duplicado)
  const combinedStr = (text + ' ' + originalFilename).toUpperCase();
  let type = 'original';
  if (combinedStr.includes('DUPLICADO') || combinedStr.includes('COPIA EMPLEADO') || combinedStr.includes('FIRMA EMPLEADO')) {
    type = 'duplicado';
  }

  // 3. Extracción de Importes Financieros
  const financialData = extractFinancialData(text);

  return {
    cuil: detectedCuil,
    formattedCuil: detectedCuil ? formatCUIL(detectedCuil) : null,
    type,
    financialData,
    text
  };
}

/**
 * Parsea montos financieros del texto del recibo
 * @param {string} text 
 * @returns {object}
 */
function extractFinancialData(text) {
  const result = {
    netPay: 0,
    grossPay: 0,
    deductions: 0,
    basicSalary: 0
  };

  if (!text) return result;

  const parseAmount = (regex) => {
    const match = text.match(regex);
    if (match && match[1]) {
      const cleaned = match[1].replace(/\./g, '').replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  result.netPay = parseAmount(/(?:neto|total\s+a\s+cobrar|liquido|neto\s+a\s+cobrar)\s*[:$]?\s*([\d.,]+)/i);
  result.grossPay = parseAmount(/(?:total\s+bruto|remunerativo|total\s+remunerativo|subtotal)\s*[:$]?\s*([\d.,]+)/i);
  result.deductions = parseAmount(/(?:total\s+descuentos|retenciones|descuentos)\s*[:$]?\s*([\d.,]+)/i);
  result.basicSalary = parseAmount(/(?:sueldo\s+basico|basico)\s*[:$]?\s*([\d.,]+)/i);

  return result;
}

/**
 * Convierte una solapa de ExcelJS a un Buffer de PDF A4 en memoria usando pdf-lib.
 * Genera ambas mitades (Duplicado arriba / Original abajo) para posibilitar el split geométrico.
 * @param {object} worksheet ExcelJS Worksheet
 * @returns {Promise<Buffer>}
 */
async function excelToPdfBuffer(worksheet) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // Tamaño A4 estándar en puntos (72 DPI)
  const font = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const halfHeight = height / 2;

  // Dibujar plantilla de visualización para ambas secciones
  const renderSection = (yOffset, sectionTitle) => {
    // Encabezado de Sección
    page.drawText(`RECIBO DE SUELDO - ${sectionTitle}`, {
      x: 40,
      y: yOffset - 30,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.3, 0.6)
    });

    page.drawLine({
      start: { x: 40, y: yOffset - 35 },
      end: { x: width - 40, y: yOffset - 35 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7)
    });
  };

  // Sección Duplicado (Mitad Superior)
  renderSection(height, 'DUPLICADO (FIRMA EMPLEADO)');
  // Sección Original (Mitad Inferior)
  renderSection(halfHeight, 'ORIGINAL (FIRMA EMPLEADOR)');

  // Extraer celdas y distribuirlas en las dos mitades
  let rowCount = 0;
  worksheet.eachRow((row, rowNumber) => {
    if (rowCount > 25) return; // Limitar filas por solapa A4

    const rowYTop = height - 50 - (rowNumber * 14);
    const rowYBottom = halfHeight - 50 - (rowNumber * 14);

    let rowText = '';
    row.eachCell((cell) => {
      let val = '';
      if (cell.value != null) {
        if (cell.text != null && cell.text !== '') {
          val = String(cell.text);
        } else if (typeof cell.value === 'object') {
          if (cell.value.result != null) {
            val = String(cell.value.result);
          } else if (Array.isArray(cell.value.richText)) {
            val = cell.value.richText.map(rt => rt.text || '').join('');
          } else if (cell.value.text != null) {
            val = String(cell.value.text);
          } else {
            val = String(cell.value);
          }
        } else {
          val = String(cell.value);
        }
      }
      if (val.trim()) {
        rowText += val.trim() + '  ';
      }
    });

    if (rowText.trim()) {
      const isHeader = rowNumber <= 3;
      const currentFont = isHeader ? fontBold : font;
      const fontSize = 8;

      if (rowYTop > halfHeight + 15) {
        page.drawText(rowText.substring(0, 110), {
          x: 40,
          y: rowYTop,
          size: fontSize,
          font: currentFont,
          color: rgb(0.15, 0.15, 0.15)
        });
      }

      if (rowYBottom > 15) {
        page.drawText(rowText.substring(0, 110), {
          x: 40,
          y: rowYBottom,
          size: fontSize,
          font: currentFont,
          color: rgb(0.15, 0.15, 0.15)
        });
      }
    }
    rowCount++;
  });

  // Línea divisoria central
  page.drawLine({
    start: { x: 20, y: halfHeight },
    end: { x: width - 20, y: halfHeight },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5)
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Realiza la división geométrica de un PDF A4 en memoria usando pdf-lib.
 * Mitad Superior -> Duplicado
 * Mitad Inferior -> Original
 * @param {Buffer} sheetPdfBuffer 
 * @returns {Promise<{ origBuffer: Buffer, dupBuffer: Buffer }>}
 */
async function splitPdfBuffer(sheetPdfBuffer) {
  const srcDoc = await PDFDocument.load(sheetPdfBuffer);

  // 1. Crear Documento Original (Mitad Inferior: 0 a halfHeight)
  const docOrig = await PDFDocument.create();
  const [pageOrig] = await docOrig.copyPages(srcDoc, [0]);
  const { width, height } = pageOrig.getSize();
  const halfHeight = height / 2;

  pageOrig.setCropBox(0, 0, width, halfHeight);
  pageOrig.setMediaBox(0, 0, width, halfHeight);
  docOrig.addPage(pageOrig);
  const origBuffer = Buffer.from(await docOrig.save());

  // 2. Crear Documento Duplicado (Mitad Superior: halfHeight a height)
  const docDup = await PDFDocument.create();
  const [pageDup] = await docDup.copyPages(srcDoc, [0]);
  pageDup.setCropBox(0, halfHeight, width, halfHeight);
  pageDup.setMediaBox(0, halfHeight, width, halfHeight);
  docDup.addPage(pageDup);
  const dupBuffer = Buffer.from(await docDup.save());

  return { origBuffer, dupBuffer };
}

/**
 * Estampa la firma digital e información de auditoría en un PDF buffer.
 * @param {Buffer} pdfBuffer 
 * @param {string} signatureBase64 Base64 PNG/JPEG de la firma
 * @param {object} metadata { name, cuil, ip, timestamp, token, position }
 * @returns {Promise<Buffer>} Buffer del PDF firmado
 */
async function signPdfBuffer(pdfBuffer, signatureBase64, metadata = {}) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const page = pages[pages.length - 1] || pages[0]; // Aplicar en última página o primera
  const { width, height } = page.getSize();

  // Limpiar encabezado data:image/...;base64,
  let cleanBase64 = signatureBase64 || '';
  if (cleanBase64.includes('base64,')) {
    cleanBase64 = cleanBase64.split('base64,')[1];
  }

  let signatureImage = null;
  if (cleanBase64) {
    try {
      const imageBytes = Buffer.from(cleanBase64, 'base64');
      // Probar como PNG y fallback a JPG si falla
      try {
        signatureImage = await pdfDoc.embedPng(imageBytes);
      } catch (e) {
        signatureImage = await pdfDoc.embedJpg(imageBytes);
      }
    } catch (err) {
      console.warn('⚠️ No se pudo decodificar la imagen de firma Base64:', err.message);
    }
  }

  // Coordenadas y dimensiones de la firma
  const pos = metadata.position || {};
  const sigWidth = pos.width || 140;
  const sigHeight = pos.height || 55;
  const xPos = pos.x != null ? pos.x : 40;
  // En pdf-lib el origen (0,0) está abajo a la izquierda
  const yPos = pos.y != null ? (height - pos.y - sigHeight) : 40;

  // Fondo de recuadro de firma de auditoría
  page.drawRectangle({
    x: xPos,
    y: yPos,
    width: sigWidth + 160,
    height: sigHeight + 15,
    color: rgb(0.96, 0.98, 1.0),
    borderColor: rgb(0.11, 0.56, 0.83),
    borderWidth: 1
  });

  // Estampar la firma en el lado izquierdo del recuadro
  if (signatureImage) {
    page.drawImage(signatureImage, {
      x: xPos + 5,
      y: yPos + 8,
      width: sigWidth,
      height: sigHeight
    });
  }

  // Texto de Auditoría Legal
  const font = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);
  const textX = xPos + sigWidth + 12;

  page.drawText('FIRMADO DIGITALMENTE', {
    x: textX,
    y: yPos + sigHeight - 2,
    size: 7,
    font: fontBold,
    color: rgb(0.11, 0.56, 0.83)
  });

  page.drawText(`Firmante: ${metadata.name || 'Empleado'}`, {
    x: textX,
    y: yPos + sigHeight - 12,
    size: 6.5,
    font: font,
    color: rgb(0.2, 0.2, 0.2)
  });

  page.drawText(`CUIL: ${metadata.cuil || 'N/D'}`, {
    x: textX,
    y: yPos + sigHeight - 21,
    size: 6.5,
    font: font,
    color: rgb(0.2, 0.2, 0.2)
  });

  page.drawText(`Fecha: ${metadata.timestamp || new Date().toISOString()}`, {
    x: textX,
    y: yPos + sigHeight - 30,
    size: 6,
    font: font,
    color: rgb(0.4, 0.4, 0.4)
  });

  page.drawText(`IP: ${metadata.ip || '127.0.0.1'}`, {
    x: textX,
    y: yPos + sigHeight - 38,
    size: 6,
    font: font,
    color: rgb(0.4, 0.4, 0.4)
  });

  const signedBytes = await pdfDoc.save();
  return Buffer.from(signedBytes);
}

module.exports = {
  isValidCUIL,
  formatCUIL,
  sanitizeFileName,
  getBufferHash,
  analyzeBuffer,
  extractFinancialData,
  excelToPdfBuffer,
  splitPdfBuffer,
  signPdfBuffer
};
