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
  const validCuilsFound = [];

  while ((match = cuilRegex.exec(text)) !== null) {
    const rawMatch = match[1] || match[0];
    const cleanMatch = rawMatch.replace(/\D/g, '');
    if (isValidCUIL(cleanMatch) && !validCuilsFound.includes(cleanMatch)) {
      validCuilsFound.push(cleanMatch);
    }
  }

  // Fallback: Buscar cualquier secuencia de 11 dígitos en el texto o nombre de archivo
  const fallbackMatches = (text + ' ' + originalFilename).match(/\b\d{11}\b/g) || [];
  for (const raw of fallbackMatches) {
    const cleanMatch = raw.replace(/\D/g, '');
    if (isValidCUIL(cleanMatch) && !validCuilsFound.includes(cleanMatch)) {
      validCuilsFound.push(cleanMatch);
    }
  }

  if (validCuilsFound.length > 0) {
    detectedCuil = validCuilsFound[0]; // Por defecto el primero
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
 * Convierte una solapa de ExcelJS a dos buffers PDF en memoria: { dupBuffer, origBuffer, fullPdfBuffer }.
 * Distingue automáticamente entre solapas de escaneo puro (solo imagen) vs solapas estructuradas con celdas de datos.
 * @param {object} workbook ExcelJS Workbook
 * @param {object} worksheet ExcelJS Worksheet
 * @returns {Promise<{ dupBuffer: Buffer, origBuffer: Buffer, fullPdfBuffer: Buffer }>}
 */
async function excelWorksheetToPdfBuffers(workbook, worksheet) {
  const images = worksheet.getImages ? worksheet.getImages() : [];
  let cellRowCount = 0;
  worksheet.eachRow((row) => {
    let hasVal = false;
    row.eachCell(c => { if (c.value != null && String(c.value).trim()) hasVal = true; });
    if (hasVal) cellRowCount++;
  });

  // CASO 1: Solapa de escaneo puro (sin datos en celdas, solo imagen pegada)
  if (cellRowCount < 5 && images.length > 0) {
    const mediaList = (workbook.model && workbook.model.media) ? workbook.model.media : [];
    images.sort((a, b) => {
      const rA = a.range?.tl?.nativeRow ?? a.range?.tl?.row ?? 0;
      const rB = b.range?.tl?.nativeRow ?? b.range?.tl?.row ?? 0;
      return rA - rB;
    });

    const firstImgRef = images[0];
    const firstImgData = mediaList.find(m => String(m.index) === String(firstImgRef.imageId) || m.index == firstImgRef.imageId);

    if (images.length >= 2) {
      const topImgData = mediaList.find(m => String(m.index) === String(images[0].imageId) || m.index == images[0].imageId) || firstImgData;
      const botImgData = mediaList.find(m => String(m.index) === String(images[1].imageId) || m.index == images[1].imageId) || firstImgData;

      const dupDoc = await PDFDocument.create();
      const pageD = dupDoc.addPage([595.28, 420.94]);
      const imgD = (topImgData.extension || '').toLowerCase() === 'png' ? await dupDoc.embedPng(topImgData.buffer) : await dupDoc.embedJpg(topImgData.buffer);
      const dimsD = imgD.scaleToFit(555, 380);
      pageD.drawImage(imgD, { x: (595.28 - dimsD.width) / 2, y: (420.94 - dimsD.height) / 2, width: dimsD.width, height: dimsD.height });

      const origDoc = await PDFDocument.create();
      const pageO = origDoc.addPage([595.28, 420.94]);
      const imgO = (botImgData.extension || '').toLowerCase() === 'png' ? await origDoc.embedPng(botImgData.buffer) : await origDoc.embedJpg(botImgData.buffer);
      const dimsO = imgO.scaleToFit(555, 380);
      pageO.drawImage(imgO, { x: (595.28 - dimsO.width) / 2, y: (420.94 - dimsO.height) / 2, width: dimsO.width, height: dimsO.height });

      const dupBuffer = Buffer.from(await dupDoc.save());
      const origBuffer = Buffer.from(await origDoc.save());
      return { dupBuffer, origBuffer, fullPdfBuffer: dupBuffer };
    } else {
      const doc = await PDFDocument.create();
      const page = doc.addPage([595.28, 841.89]);
      const img = (firstImgData.extension || '').toLowerCase() === 'png' ? await doc.embedPng(firstImgData.buffer) : await doc.embedJpg(firstImgData.buffer);
      const dims = img.scaleToFit(555, 800);
      page.drawImage(img, { x: (595.28 - dims.width) / 2, y: (841.89 - dims.height) / 2, width: dims.width, height: dims.height });
      const fullBytes = await doc.save();
      const fullPdfBuffer = Buffer.from(fullBytes);

      const splitResult = await splitPdfBuffer(fullPdfBuffer);
      return { dupBuffer: splitResult.dupBuffer, origBuffer: splitResult.origBuffer, fullPdfBuffer };
    }
  }

  // CASO 2: Solapa estructurada con celdas de datos (ej: Recibos Sueldos -para prueba.xls.xlsx)
  let sec1Rows = [];
  let sec2Rows = [];

  worksheet.eachRow((row, rowNumber) => {
    let cells = [];
    row.eachCell({ includeEmpty: false }, (c, colNumber) => {
      let val = '';
      if (c.value != null) {
        if (typeof c.value === 'object') {
          val = c.value.result != null ? c.value.result : (c.value.text || '');
        } else {
          val = String(c.value);
        }
      }
      val = String(val).trim();
      if (val) cells.push({ col: colNumber, val });
    });
    if (cells.length > 0) {
      if (rowNumber < 78) sec1Rows.push({ rowNumber, cells });
      else sec2Rows.push({ rowNumber, cells });
    }
  });

  if (sec2Rows.length === 0) sec2Rows = sec1Rows;

  async function renderSectionToPdfBuffer(secRows, sectionTitle) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);
    const { width, height } = page.getSize();

    page.drawRectangle({
      x: 25, y: height - 40, width: width - 50, height: 26,
      color: rgb(0.92, 0.95, 0.98), borderColor: rgb(0.7, 0.8, 0.9), borderWidth: 1
    });
    page.drawText(`RECIBO DE HABERES - ${sectionTitle}`, {
      x: 35, y: height - 32, size: 10, font: fontBold, color: rgb(0.1, 0.3, 0.6)
    });

    let y = height - 55;

    for (const r of secRows) {
      if (y < 40) break;

      const rowText = r.cells.map(c => c.val).join(' ');
      const isHeader = r.rowNumber <= 5 || rowText.includes('RECIBO DE HABERES') || rowText.includes('Totales') || rowText.includes('Total Neto');
      const isSectionHeader = rowText.includes('Periodo') || rowText.includes('Banco') || rowText.includes('Descripcion de Conceptos') || rowText.includes('Costo Total');

      if (isSectionHeader) {
        page.drawRectangle({ x: 25, y: y - 2, width: width - 50, height: 12, color: rgb(0.95, 0.96, 0.98) });
      }

      for (const c of r.cells) {
        let x = 30;
        if (c.col === 2) x = 30;
        else if (c.col === 3) x = 160;
        else if (c.col === 4) x = 240;
        else if (c.col === 5) x = 310;
        else if (c.col === 6) x = 390;
        else if (c.col === 7) x = 480;
        else x = 30 + (c.col - 1) * 60;

        let str = c.val;
        let maxLen = (c.col === 2) ? 40 : 22;
        if (str.length > maxLen) str = str.substring(0, maxLen) + '...';

        if (typeof c.val === 'number' || (!isNaN(c.val) && c.val.includes('.'))) {
          const num = parseFloat(c.val);
          if (!isNaN(num) && num > 100) {
            str = num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          }
        }

        page.drawText(str, {
          x: Math.min(x, 505),
          y,
          size: isHeader ? 7.5 : 6.5,
          font: (isHeader || isSectionHeader) ? fontBold : font,
          color: isHeader ? rgb(0.05, 0.2, 0.5) : rgb(0.15, 0.15, 0.15)
        });
      }

      y -= 11;
    }

    if (images.length > 0 && workbook.model && workbook.model.media) {
      try {
        const mediaList = workbook.model.media;
        const mediaObj = mediaList[0];
        if (mediaObj && mediaObj.buffer) {
          const imgEmbed = (mediaObj.extension || '').toLowerCase() === 'png' ? await pdfDoc.embedPng(mediaObj.buffer) : await pdfDoc.embedJpg(mediaObj.buffer);
          const dims = imgEmbed.scaleToFit(120, 50);
          page.drawImage(imgEmbed, { x: width - 170, y: Math.max(50, y - 10), width: dims.width, height: dims.height });
        }
      } catch (err) {
        console.warn('⚠️ No se pudo incrustar la imagen en el PDF:', err.message);
      }
    }

    return Buffer.from(await pdfDoc.save());
  }

  const dupBuffer = await renderSectionToPdfBuffer(sec1Rows, 'DUPLICADO (FIRMA EMPLEADO)');
  const origBuffer = await renderSectionToPdfBuffer(sec2Rows, 'ORIGINAL (FIRMA EMPLEADOR)');

  return { dupBuffer, origBuffer, fullPdfBuffer: dupBuffer };
}

/**
 * Legacy helper para compatibilidad: convierte worksheet a Buffer A4
 */
async function excelToPdfBuffer(worksheet) {
  const result = await excelWorksheetToPdfBuffers(null, worksheet);
  return result.fullPdfBuffer;
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

/**
 * Crea un Buffer PDF a partir de una imagen (Buffer de PNG o JPG)
 * @param {object} imgData { buffer: Buffer, extension: string }
 * @param {Array<number>} pageDimensions [width, height], por defecto A4 [595.28, 841.89]
 * @returns {Promise<Buffer>} Buffer del PDF generado
 */
async function buildPdfWithImage(imgData, pageDimensions = [595.28, 841.89]) {
  if (!imgData || !imgData.buffer) {
    throw new Error("No se proporcionó información de imagen válida.");
  }
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage(pageDimensions);
  let pdfImg;
  const ext = String(imgData.extension || '').toLowerCase();

  if (ext === 'png') {
    pdfImg = await pdfDoc.embedPng(imgData.buffer);
  } else if (ext === 'jpeg' || ext === 'jpg') {
    pdfImg = await pdfDoc.embedJpg(imgData.buffer);
  } else {
    try {
      pdfImg = await pdfDoc.embedPng(imgData.buffer);
    } catch {
      pdfImg = await pdfDoc.embedJpg(imgData.buffer);
    }
  }

  const dims = pdfImg.scaleToFit(page.getWidth() - 40, page.getHeight() - 40);
  page.drawImage(pdfImg, {
    x: (page.getWidth() - dims.width) / 2,
    y: (page.getHeight() - dims.height) / 2,
    width: dims.width,
    height: dims.height
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = {
  isValidCUIL,
  formatCUIL,
  sanitizeFileName,
  getBufferHash,
  analyzeBuffer,
  extractFinancialData,
  excelToPdfBuffer,
  excelWorksheetToPdfBuffers,
  splitPdfBuffer,
  signPdfBuffer,
  buildPdfWithImage
};

