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
 * Extrae los datos estructurados de un rango de celdas de una solapa de ExcelJS.
 * - Respeta celdas combinadas (merged cells) para evitar duplicar el valor en celdas unidas.
 * - Formatea números con parte decimal a exactamente 2 decimales (ej: 123.40 o 123,40).
 * @param {object} worksheet ExcelJS Worksheet
 * @param {number} startRow
 * @param {number} endRow
 * @returns {object} Datos estructurados de la sección del recibo
 */
function extractReceiptDataFromRange(worksheet, startRow, endRow) {
  const monthsEs = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const formatDate = (dateObj) => {
    if (!dateObj || isNaN(dateObj.getTime())) return null;

    const d = String(dateObj.getDate()).padStart(2, '0');
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const y = dateObj.getFullYear();
    const rawMonthIndex = dateObj.getMonth();

    return {
      periodFormat: `${monthsEs[rawMonthIndex]}-${y}`,
      shortFormat: `${d}/${m}/${y}`
    };
  };

  const formatValue = (val, numVal, rawVal, isShortDateContext = false, isPeriodContext = false) => {
    // 1. Detectar objeto Date o String de fecha JS (ej: Thu Jul 30 2026 20:00:00 GMT...)
    let dateObj = null;
    if (rawVal instanceof Date) {
      dateObj = rawVal;
    } else if (typeof val === 'string' && /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{4}/i.test(val.trim())) {
      dateObj = new Date(val.trim());
    }

    if (dateObj && !isNaN(dateObj.getTime())) {
      const parsedDates = formatDate(dateObj);
      if (parsedDates) {
        if (isPeriodContext) {
          return parsedDates.periodFormat;
        }
        return parsedDates.shortFormat;
      }
    }

    // 2. Si es string en PeriodContext que representa fecha ISO / YYYY-MM / MM-YYYY / MM/YYYY
    if (isPeriodContext && typeof val === 'string' && val.trim()) {
      const cleaned = val.trim();
      if (/^[a-z]+-\d{4}$/i.test(cleaned)) {
        return cleaned.toLowerCase();
      }
      const yyyyMmMatch = cleaned.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
      if (yyyyMmMatch) {
        const y = yyyyMmMatch[1];
        const mIdx = parseInt(yyyyMmMatch[2], 10) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          return `${monthsEs[mIdx]}-${y}`;
        }
      }
      const mmYyyyMatch = cleaned.match(/^(\d{1,2})[-/](\d{4})$/);
      if (mmYyyyMatch) {
        const mIdx = parseInt(mmYyyyMatch[1], 10) - 1;
        const y = mmYyyyMatch[2];
        if (mIdx >= 0 && mIdx < 12) {
          return `${monthsEs[mIdx]}-${y}`;
        }
      }
    }

    // 3. Formatear números a 2 decimales
    if (typeof numVal === 'number' && !isNaN(numVal)) {
      if (!Number.isInteger(numVal)) {
        return numVal.toFixed(2).replace('.', ',');
      }
    } else if (typeof val === 'string' && /^-?\d+[\.,]\d+$/.test(val.trim())) {
      const parsed = parseFloat(val.trim().replace(',', '.'));
      if (!isNaN(parsed) && !Number.isInteger(parsed)) {
        return parsed.toFixed(2).replace('.', ',');
      }
    }
    return val;
  };

  const getCellRawText = (r, c) => {
    if (r < 1 || c < 1) return '';
    const row = worksheet.getRow(r);
    if (!row) return '';
    const cell = row.getCell(c);
    if (!cell || cell.value == null) return '';
    if (cell.text != null && cell.text !== '') return String(cell.text).trim();
    if (typeof cell.value === 'string') return cell.value.trim();
    if (typeof cell.value === 'object') {
      if (cell.value.result != null) return String(cell.value.result).trim();
      if (cell.value.text != null) return String(cell.value.text).trim();
    }
    return String(cell.value).trim();
  };

  const getCellValue = (r, c) => {
    const row = worksheet.getRow(r);
    const cell = row.getCell(c);
    if (!cell) return '';

    if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
      return '';
    }

    let rawVal = cell.value;
    let textVal = cell.text;
    let numVal = typeof rawVal === 'number' ? rawVal : null;

    if (rawVal == null) return '';

    let res = '';
    if (textVal != null && textVal !== '') {
      res = String(textVal).trim();
    } else if (typeof rawVal === 'object' && !(rawVal instanceof Date)) {
      if (rawVal.result != null) {
        res = String(rawVal.result).trim();
        if (typeof rawVal.result === 'number') numVal = rawVal.result;
        if (rawVal.result instanceof Date) rawVal = rawVal.result;
      } else if (Array.isArray(rawVal.richText)) {
        res = rawVal.richText.map(rt => rt.text || '').join('').trim();
      } else if (rawVal.text != null) {
        res = String(rawVal.text).trim();
      } else {
        res = String(rawVal).trim();
      }
    } else {
      res = String(rawVal).trim();
    }

    const headerAboveText = getCellRawText(r - 1, c).toLowerCase();
    const headerLeftText = getCellRawText(r, c - 1).toLowerCase();
    const rowHeaderStr = row.values ? String(row.values).toLowerCase() : '';
    const prevRowHeaderStr = worksheet.getRow(r - 1)?.values ? String(worksheet.getRow(r - 1).values).toLowerCase() : '';

    const isPeriodContext = (
      headerAboveText.includes('periodo') ||
      headerAboveText.includes('período') ||
      headerAboveText.includes('per.') ||
      headerLeftText.includes('periodo') ||
      headerLeftText.includes('período') ||
      rowHeaderStr.includes('periodo abonado') ||
      rowHeaderStr.includes('periodo seg') ||
      prevRowHeaderStr.includes('periodo abonado') ||
      prevRowHeaderStr.includes('periodo seg')
    );

    const isShortDateContext = !isPeriodContext && (
      headerAboveText.includes('deposito') ||
      headerAboveText.includes('depósito') ||
      headerAboveText.includes('ingreso') ||
      headerAboveText.includes('f.ing') ||
      headerAboveText.includes('f.dep') ||
      headerAboveText.includes('fecha') ||
      rowHeaderStr.includes('deposito') ||
      rowHeaderStr.includes('depósito') ||
      rowHeaderStr.includes('ingreso') ||
      rowHeaderStr.includes('f.ing') ||
      rowHeaderStr.includes('f.dep')
    );

    return formatValue(res, numVal, rawVal, isShortDateContext, isPeriodContext);
  };

  const rows = [];
  for (let r = startRow; r <= endRow; r++) {
    const rowValues = [];
    let hasValue = false;
    for (let c = 2; c <= 7; c++) { // Columnas B a G (2 a 7)
      const val = getCellValue(r, c);
      if (val) hasValue = true;
      rowValues.push(val);
    }
    if (hasValue) {
      rows.push({ rowNumber: r, cells: rowValues });
    }
  }

  return { rows };
}

/**
 * Renderiza una sección de recibo (rango de celdas) en una página única de PDF usando pdf-lib.
 * @param {object} worksheet ExcelJS Worksheet
 * @param {number} startRow
 * @param {number} endRow
 * @param {string} title Título del recibo ('DUPLICADO (FIRMA EMPLEADO)' u 'ORIGINAL')
 * @returns {Promise<Buffer>} Buffer del PDF de 1 página
 */
async function renderReceiptSectionToPdfBuffer(worksheet, startRow, endRow, title) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // Tamaño A4 estándar
  const font = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Margen superior y coordenadas
  let currentY = height - 40;

  // Header principal del Recibo
  page.drawRectangle({
    x: 35,
    y: currentY - 25,
    width: width - 70,
    height: 30,
    color: rgb(0.92, 0.94, 0.98),
    borderColor: rgb(0.2, 0.3, 0.6),
    borderWidth: 1
  });

  page.drawText(`RECIBO DE HABERES - ${title}`, {
    x: 45,
    y: currentY - 17,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.2, 0.5)
  });

  page.drawText(`${worksheet.name}`, {
    x: width - 180,
    y: currentY - 17,
    size: 9,
    font: fontBold,
    color: rgb(0.3, 0.3, 0.3)
  });

  currentY -= 40;

  // Dibujar las filas extraídas del rango especificado (B:G)
  const rangeData = extractReceiptDataFromRange(worksheet, startRow, endRow);

  // Anchos aproximados para las 6 columnas B, C, D, E, F, G (Total ~525 pt)
  const colWidths = [120, 180, 55, 55, 55, 60];
  const startX = 35;

  let lineCount = 0;
  const maxLinesPerPage = 62;

  for (const rowData of rangeData.rows) {
    if (lineCount >= maxLinesPerPage) break;

    const rowY = currentY - (lineCount * 11.5);
    if (rowY < 90) break; // Garantizar espacio inferior para la zona de firma (mínimo 90pt libres)

    let currentX = startX;
    const isHeaderRow = lineCount < 4 || rowData.cells.some(c => c.toUpperCase().includes('CONCEPTO') || c.toUpperCase().includes('HABERES') || c.toUpperCase().includes('TOTAL'));
    const currentFont = isHeaderRow ? fontBold : font;
    const fontSize = isHeaderRow ? 7.5 : 7;
    const textColor = isHeaderRow ? rgb(0.1, 0.1, 0.4) : rgb(0.15, 0.15, 0.15);

    for (let i = 0; i < rowData.cells.length; i++) {
      const cellText = rowData.cells[i];
      const cellW = colWidths[i] || 70;

      // Dibujar borde de celda
      page.drawRectangle({
        x: currentX,
        y: rowY - 2.5,
        width: cellW,
        height: 11.5,
        color: isHeaderRow ? rgb(0.93, 0.95, 0.98) : undefined,
        borderColor: isHeaderRow ? rgb(0.65, 0.75, 0.88) : rgb(0.85, 0.85, 0.88),
        borderWidth: 0.5
      });

      if (cellText) {
        // Calcular el ancho disponible sumando las celdas vacías consecutivas a la derecha
        let availableW = cellW;
        for (let j = i + 1; j < rowData.cells.length; j++) {
          if (!rowData.cells[j]) {
            availableW += (colWidths[j] || 70);
          } else {
            break;
          }
        }

        // Truncar texto solo si sobrepasa el ancho acumulado disponible
        const maxChars = Math.floor(availableW / 4.2);
        const truncated = cellText.length > maxChars ? cellText.substring(0, maxChars - 1) + '…' : cellText;

        page.drawText(truncated, {
          x: currentX + 3,
          y: rowY,
          size: fontSize,
          font: currentFont,
          color: textColor
        });
      }
      currentX += cellW;
    }

    lineCount++;
  }

  // Zona Inferior reservada para Firma
  const signatureY = 35;
  page.drawLine({
    start: { x: 35, y: signatureY + 45 },
    end: { x: width - 35, y: signatureY + 45 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8)
  });

  page.drawRectangle({
    x: 40,
    y: signatureY,
    width: 220,
    height: 40,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 0.5
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Convierte una solapa de ExcelJS a dos buffers PDF independientes (Duplicado y Original).
 * - Duplicado: Rango B2:G77
 * - Original: Rango B80:G153
 * @param {object} worksheet ExcelJS Worksheet
 * @returns {Promise<{ dupBuffer: Buffer, origBuffer: Buffer }>}
 */
async function excelToPdfBuffer(worksheet) {
  const dupBuffer = await renderReceiptSectionToPdfBuffer(worksheet, 2, 77, 'DUPLICADO (FIRMA EMPLEADO)');
  const origBuffer = await renderReceiptSectionToPdfBuffer(worksheet, 80, 153, 'ORIGINAL');
  return { dupBuffer, origBuffer };
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
