const pdfParse = require('pdf-parse');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

/**
 * Envía el Excel COMPLETO (multipart/form-data: file + month) al microservicio
 * externo de generación de recibos (LibreOffice + UNO). El microservicio ya
 * exporta, por cada hoja válida, un PDF "Original" y un PDF "Duplicado" según
 * los rangos de celda fijos, y devuelve todo empaquetado en un .zip junto a un
 * manifest.json con la metadata { sheet, type, range, file }.
 *
 * @param {Buffer} fileBuffer contenido del .xlsx subido por el usuario
 * @param {string} month formato YYYY-MM
 * @param {string} [originalFilename]
 * @returns {Promise<{ bySheet: Object<string, { Original?: Buffer, Duplicado?: Buffer }>, manifest: object }>}
 */
async function generatePayslipsZipFromExcel(fileBuffer, month, originalFilename = 'planilla.xlsx') {
  const baseUrl = (process.env.RECIBOS_SERVICE_URL || '').replace(/\/+$/, '');

  if (!baseUrl) {
    throw new Error('RECIBOS_SERVICE_URL no está configurado. Debe apuntar al microservicio de generación de recibos.');
  }

  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), originalFilename);
  form.append('month', month);

  const response = await fetch(`${baseUrl}/api/generar-recibo`, {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Error en generador de recibos (${response.status}): ${details || response.statusText || 'sin detalle'}`);
  }

  const zipBuffer = Buffer.from(await response.arrayBuffer());
  const zip = new AdmZip(zipBuffer);

  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    throw new Error('La respuesta del generador de recibos no incluye manifest.json');
  }
  const manifest = JSON.parse(zip.readAsText(manifestEntry));

  const bySheet = {};
  for (const item of manifest.generated || []) {
    const entry = zip.getEntry(item.file);
    if (!entry) continue;
    if (!bySheet[item.sheet]) bySheet[item.sheet] = {};
    bySheet[item.sheet][item.type] = entry.getData(); // 'Original' | 'Duplicado' -> Buffer
  }

  return { bySheet, manifest };
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
 * Estampa la firma y los metadatos de auditoría dentro del buffer PDF.
 *
 * La firma (signatureBase64) debe ser un data URL con el formato:
 *   "data:image/png;base64,..." o "data:image/jpeg;base64,..."
 *
 * El objeto metadata puede incluir:
 *   name      {string}  - Nombre del firmante
 *   cuil      {string}  - CUIL del firmante
 *   ip        {string}  - IP desde la que se firmó
 *   timestamp {string}  - ISO timestamp de la firma
 *   token     {string}  - Token único del recibo
 *   position  {object}  - { x, y, width, height, page } (opcionales)
 *
 * @param {Buffer} pdfBuffer       Buffer del PDF original
 * @param {string} signatureBase64 Data URL de la imagen de firma
 * @param {object} metadata        Metadatos de auditoría
 * @returns {Promise<Buffer>}      Buffer del PDF con la firma estampada
 */
async function signPdfBuffer(pdfBuffer, signatureBase64, metadata = {}) {
  if (!pdfBuffer || pdfBuffer.length === 0) return Buffer.alloc(0);

  const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

  // ── 1. Cargar el documento ──────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });

  // ── 2. Determinar en qué página colocar la firma ────────────────────────────
  const pages = pdfDoc.getPages();
  const pageIndex =
    typeof metadata.position?.page === 'number'
      ? Math.max(0, Math.min(metadata.position.page, pages.length - 1))
      : pages.length - 1; // última página por defecto

  const targetPage = pages[pageIndex];
  const { width: pageWidth, height: pageHeight } = targetPage.getSize();

  // ── 3. Incrustar la imagen de firma ─────────────────────────────────────────
  let sigImage = null;
  let sigDims  = { width: 0, height: 0 };

  if (typeof signatureBase64 === 'string' && signatureBase64.includes('base64,')) {
    const [header, b64data] = signatureBase64.split('base64,');
    const imgBytes = Buffer.from(b64data, 'base64');

    try {
      if (header.toLowerCase().includes('png')) {
        sigImage = await pdfDoc.embedPng(imgBytes);
      } else {
        sigImage = await pdfDoc.embedJpg(imgBytes);
      }

      // Dimensiones deseadas de la imagen en el PDF
      const sigW = typeof metadata.position?.width  === 'number' ? metadata.position.width  : 160;
      const sigH = typeof metadata.position?.height === 'number' ? metadata.position.height : 60;
      sigDims = sigImage.scale(Math.min(sigW / sigImage.width, sigH / sigImage.height));
    } catch (imgErr) {
      console.warn('[signPdfBuffer] No se pudo incrustar la imagen de firma:', imgErr.message);
    }
  }

  // ── 4. Calcular posición XY en coordenadas pdf-lib (origen = esquina inf-izq) ─
  const MARGIN  = 24;
  const AUDIT_H = 44; // altura reservada para el bloque de texto de auditoría

  // X: posición de la imagen de firma
  const sigX =
    typeof metadata.position?.x === 'number'
      ? metadata.position.x
      : MARGIN;

  // Y: la firma va encima del bloque de auditoría
  const sigY =
    typeof metadata.position?.y === 'number'
      ? metadata.position.y
      : MARGIN + AUDIT_H;

  // ── 5. Dibujar imagen de firma ───────────────────────────────────────────────
  if (sigImage) {
    targetPage.drawImage(sigImage, {
      x:      sigX,
      y:      sigY,
      width:  sigDims.width,
      height: sigDims.height,
    });
  }

  // ── 6. Dibujar bloque de auditoría ───────────────────────────────────────────
  const font    = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const FONT_SZ = 6.5;
  const LINE_H  = 9;
  const textX   = MARGIN;
  const auditColor = rgb(0.35, 0.35, 0.35);

  const auditLines = [
    `Firmado electrónicamente${metadata.name ? ` por: ${metadata.name}` : ''}`,
    [
      metadata.cuil      && `CUIL: ${metadata.cuil}`,
      metadata.ip        && `IP: ${metadata.ip}`,
      metadata.timestamp && `Fecha: ${metadata.timestamp}`,
    ].filter(Boolean).join('   |   '),
    metadata.token ? `Token: ${metadata.token}` : null,
  ].filter(Boolean);

  // Línea separadora
  targetPage.drawLine({
    start: { x: MARGIN,             y: MARGIN + AUDIT_H - 2 },
    end:   { x: pageWidth - MARGIN, y: MARGIN + AUDIT_H - 2 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });

  auditLines.forEach((line, idx) => {
    targetPage.drawText(line, {
      x:        textX,
      y:        MARGIN + AUDIT_H - 14 - idx * LINE_H,
      size:     FONT_SZ,
      font,
      color:    auditColor,
      maxWidth: pageWidth - MARGIN * 2,
    });
  });

  // ── 7. Serializar y devolver el PDF modificado ───────────────────────────────
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
  extractReceiptFieldsFromWorksheet,
  generatePayslipsZipFromExcel,
  signPdfBuffer
};