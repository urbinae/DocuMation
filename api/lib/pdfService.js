const pdfParse = require('pdf-parse');
const crypto = require('crypto');

/**
 * Genera un PDF de recibo delegando en el microservicio externo configurado
 * para Vercel. La plantilla maestra se procesa fuera del runtime serverless
 * usando LibreOffice + OpenPyXL, evitando la dependencia de pdf-lib.
 * @param {object} payload
 * @returns {Promise<Buffer>} PDF generado por el servicio externo
 */
async function generatePayslipPdfFromData(payload = {}) {
  const baseUrl = (process.env.RECIBOS_SERVICE_URL || '').replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error('RECIBOS_SERVICE_URL no está configurado. Debe apuntar al microservicio de generación de recibos.');
  }

  const response = await fetch(`${baseUrl}/generar-recibo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Error en generador de recibos (${response.status}): ${details || response.statusText || 'sin detalle'}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Extrae un payload mínimo para alimentar la plantilla maestra del microservicio
 * de recibos desde una hoja de Excel.
 * @param {object} worksheet
 * @returns {object}
 */
function extractReceiptFieldsFromWorksheet(worksheet) {
  const readCell = (row, col) => {
    const targetRow = worksheet.getRow ? worksheet.getRow(row) : null;
    if (!targetRow) return '';
    const cell = targetRow.getCell(col);
    if (!cell || cell.value == null) return '';
    if (cell.text != null && cell.text !== '') return String(cell.text).trim();
    if (typeof cell.value === 'object') {
      if (cell.value.result != null) return String(cell.value.result).trim();
      if (Array.isArray(cell.value.richText)) return cell.value.richText.map(rt => rt.text || '').join('').trim();
      if (cell.value.text != null) return String(cell.value.text).trim();
      return String(cell.value).trim();
    }
    return String(cell.value).trim();
  };

  const normalize = (value) => (value == null ? '' : String(value).trim());
  return {
    nombre_apellido: normalize(readCell(8, 3) || readCell(8, 2) || readCell(7, 3)),
    periodo_abonado: normalize(readCell(8, 2) || readCell(8, 1) || readCell(8, 3)),
    cuil: normalize(readCell(7, 7) || readCell(7, 8)),
    obra_social: normalize(readCell(9, 7) || readCell(9, 8)),
    banco: normalize(readCell(11, 2)),
    periodo_seg_soc: normalize(readCell(11, 3)),
    fecha_deposito: normalize(readCell(11, 4)),
    tarea: normalize(readCell(11, 5)),
    fecha_ingreso: normalize(readCell(11, 6)),
    rem_basica: normalize(readCell(11, 7)),
    remuneracion: normalize(readCell(13, 6) || readCell(13, 7)),
    a_cuenta_futuros_aumentos: normalize(readCell(18, 6) || readCell(18, 7)),
    importe_jubilacion: normalize(readCell(22, 7) || readCell(22, 8)),
    importe_inssjp: normalize(readCell(23, 7) || readCell(23, 8)),
    importe_obra_social_desc: normalize(readCell(24, 7) || readCell(24, 8))
  };
}

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
  const safeBuffer = Buffer.isBuffer(fileBuffer)
    ? fileBuffer
    : fileBuffer && typeof fileBuffer === 'object' && fileBuffer.data && Buffer.isBuffer(fileBuffer.data)
      ? Buffer.from(fileBuffer.data)
      : null;

  try {
    if (!safeBuffer) {
      return {
        cuil: null,
        formattedCuil: null,
        type: 'original',
        financialData: extractFinancialData(''),
        text: ''
      };
    }

    const pdfData = await pdfParse(safeBuffer);
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
 * En Vercel no se utiliza pdf-lib para renderizar el recibo. Se delega la
 * generación al microservicio externo basado en LibreOffice/OpenPyXL.
 * @param {object} worksheet ExcelJS Worksheet
 * @returns {Promise<{ dupBuffer: Buffer, origBuffer: Buffer }>}
 */
async function excelToPdfBuffer(worksheet) {
  const payload = extractReceiptFieldsFromWorksheet(worksheet);
  const pdfBuffer = await generatePayslipPdfFromData(payload);
  return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer || []);
}

/**
 * En Vercel no se divide un PDF en memoria con pdf-lib; el servicio externo ya
 * renderiza la versión final del recibo. Para mantener compatibilidad de la API,
 * devolvemos el mismo buffer para ambas versiones.
 * @param {Buffer} sheetPdfBuffer
 * @returns {Promise<{ origBuffer: Buffer, dupBuffer: Buffer }>}
 */
async function splitPdfBuffer(sheetPdfBuffer) {
  const safeBuffer = Buffer.isBuffer(sheetPdfBuffer)
    ? sheetPdfBuffer
    : Buffer.from(sheetPdfBuffer || []);

  return {
    origBuffer: Buffer.from(safeBuffer),
    dupBuffer: Buffer.from(safeBuffer)
  };
}

/**
 * Firma de recibo en Vercel: se deja como pass-through para no depender de pdf-lib.
 * La firma digital real debe realizarse en el microservicio externo o en un worker
 * dedicado fuera del runtime serverless.
 * @param {Buffer} pdfBuffer
 * @param {string} signatureBase64
 * @param {object} metadata
 * @returns {Promise<Buffer>}
 */
async function signPdfBuffer(pdfBuffer, signatureBase64, metadata = {}) {
  if (!pdfBuffer) return Buffer.alloc(0);
  return Buffer.from(pdfBuffer);
}

module.exports = {
  isValidCUIL,
  formatCUIL,
  sanitizeFileName,
  getBufferHash,
  analyzeBuffer,
  extractFinancialData,
  extractReceiptFieldsFromWorksheet,
  generatePayslipPdfFromData,
  excelToPdfBuffer,
  splitPdfBuffer,
  signPdfBuffer
};
