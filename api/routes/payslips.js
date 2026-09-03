const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const { supabase } = require('../lib/supabase');
const pdfService = require('../lib/pdfService');
const emailService = require('../services/emailService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Middleware para capturar archivo en memoria sin importar la clave ('file', 'pdf', 'excel', etc.)
const fileUploadMiddleware = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: `Error en subida de archivo: ${err.message}` });
    }
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
};

/**
 * Helper para obtener BASE_URL formateada sin barra final
 */
function getBaseUrl() {
  return (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
}

/**
 * Helper para enriquecer objetos de recibo con URLs completas (firma / previsualización)
 * y mapear campos snake_case → camelCase para compatibilidad con el frontend React.
 * Se preservan los nombres snake_case originales para no romper código existente.
 */
function enrichPayslipWithUrls(payslip) {
  if (!payslip) return null;
  const baseUrl = getBaseUrl();
  return {
    ...payslip,
    // ── Alias camelCase requeridos por PayslipsTab.jsx / EmployeeDashboard.jsx ──
    employeeId:    payslip.employee_id             || null,
    originalPath:  payslip.original_storage_path  || null,
    duplicadoPath: payslip.duplicado_storage_path  || null,
    signedPath:    payslip.signed_storage_path     || null,
    detectedCuil:  payslip.detected_cuil           || null,
    financialData: payslip.financial_data          || null,
    signedAt:      payslip.signed_at               || null,
    scheduledAt:   payslip.scheduled_at            || null,
    // ── URL de firma basada en BASE_URL ──
    sign_url: payslip.token ? `${baseUrl}/api/sign/${payslip.token}` : null
  };
}

/**
 * GET /api/payslips
 * Listado de recibos enriquecido con datos del empleado y URLs de firma basadas en BASE_URL
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payslips')
      .select(`
        *,
        employees (
          id,
          name,
          email,
          cuil,
          puesto
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedData = (data || []).map(enrichPayslipWithUrls);
    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener recibos', details: err.message });
  }
});

/**
 * GET /api/payslips/employee/:employeeId
 * Listado de recibos pertenecientes a un empleado específico por su ID
 */
async function getPayslipsByEmployeeHandler(req, res) {
  try {
    const { employeeId } = req.params;
    const { data, error } = await supabase
      .from('payslips')
      .select(`
        *,
        employees (
          id,
          name,
          email,
          cuil,
          puesto
        )
      `)
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '22P02') {
        return res.json([]);
      }
      throw error;
    }

    const formattedData = (data || []).map(enrichPayslipWithUrls);
    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener recibos del empleado', details: err.message });
  }
}

router.get('/employee/:employeeId', getPayslipsByEmployeeHandler);

/**
 * POST /api/payslips/upload
 * Subida individual de PDF (Original o Duplicado)
 */
router.post('/upload', fileUploadMiddleware, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Debe adjuntar un archivo PDF en la petición (campo "file" o "pdf")' });
    }

    const month = req.body.month || new Date().toISOString().substring(0, 7);
    const fileBuffer = req.file.buffer;
    const originalFilename = req.file.originalname || 'recibo.pdf';

    // 1. Deduplicación por Hash SHA-256
    const hash = pdfService.getBufferHash(fileBuffer);
    const { data: existingHash } = await supabase
      .from('payslips')
      .select('id')
      .or(`original_hash.eq.${hash},duplicado_hash.eq.${hash}`)
      .maybeSingle();

    if (existingHash) {
      return res.status(400).json({
        error: 'El archivo ya fue subido previamente (duplicado)',
        skipped: true
      });
    }

    // 2. Análisis del Buffer PDF y extracción de CUIL
    const analysis = await pdfService.analyzeBuffer(fileBuffer, originalFilename);
    if (!analysis.cuil) {
      return res.status(400).json({
        error: 'No se pudo detectar un CUIL válido en el documento PDF',
        noTextLayer: true
      });
    }

    // 3. Buscar empleado en la base de datos por CUIL
    const formatted = pdfService.formatCUIL(analysis.cuil);
    const cleanCuil = String(analysis.cuil).replace(/\D/g, '');

    const { data: allEmployees } = await supabase
      .from('employees')
      .select('id, cuil, name, email');

    let employee = (allEmployees || []).find(emp => {
      const empClean = String(emp.cuil || '').replace(/\D/g, '');
      return empClean === cleanCuil || emp.cuil === analysis.cuil || emp.cuil === formatted;
    });

    if (!employee) {
      const { data: empDirect } = await supabase
        .from('employees')
        .select('id, cuil, name, email')
        .or(`cuil.eq.${analysis.cuil},cuil.eq.${formatted}`)
        .maybeSingle();
      employee = empDirect;
    }

    if (!employee) {
      return res.status(404).json({ error: `No se encontró un empleado registrado con el CUIL ${analysis.cuil}` });
    }

    // 4. Subida del Buffer a Supabase Storage (Bucket 'payslips')
    const storageFolder = analysis.type === 'duplicado' ? 'duplicados' : 'originals';
    const cleanFilename = pdfService.sanitizeFileName(originalFilename);
    const storagePath = `${storageFolder}/${uuidv4()}_${cleanFilename}`;

    const { error: uploadErr } = await supabase.storage
      .from('payslips')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadErr) {
      throw new Error(`Error al subir el archivo a Supabase Storage: ${uploadErr.message}`);
    }

    // 5. Consolidación / Upsert en Base de Datos Postgres
    const { data: existingPayslip } = await supabase
      .from('payslips')
      .select('*')
      .eq('employee_id', employee.id)
      .eq('month', month)
      .maybeSingle();

    let resultPayslip = null;

    if (existingPayslip) {
      const updatePayload = {
        status: 'Cargado'
      };

      if (analysis.type === 'duplicado') {
        updatePayload.duplicado_storage_path = storagePath;
        updatePayload.duplicado_hash = hash;
      } else {
        updatePayload.original_storage_path = storagePath;
        updatePayload.original_hash = hash;
      }

      if (analysis.financialData) {
        updatePayload.financial_data = analysis.financialData;
      }

      const { data: updated, error: updateErr } = await supabase
        .from('payslips')
        .update(updatePayload)
        .eq('id', existingPayslip.id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      resultPayslip = updated;
    } else {
      const insertPayload = {
        employee_id: employee.id,
        detected_cuil: analysis.cuil,
        month,
        original_storage_path: analysis.type === 'original' ? storagePath : '',
        duplicado_storage_path: analysis.type === 'duplicado' ? storagePath : '',
        status: 'Cargado',
        token: uuidv4(),
        financial_data: analysis.financialData,
        original_hash: analysis.type === 'original' ? hash : null,
        duplicado_hash: analysis.type === 'duplicado' ? hash : null
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('payslips')
        .insert([insertPayload])
        .select()
        .single();

      if (insertErr) throw insertErr;
      resultPayslip = inserted;
    }

    res.status(201).json({
      success: true,
      message: 'Recibo procesado y guardado correctamente',
      payslip: enrichPayslipWithUrls(resultPayslip),
      analysis
    });
  } catch (err) {
    res.status(500).json({ error: 'Error en procesamiento de recibo', details: err.message });
  }
});

/**
 * POST /api/payslips/upload-excel
 * Carga masiva de Excel (.xlsx) con procesamiento nativo en memoria (pdf-lib & exceljs)
 */
router.post('/upload-excel', fileUploadMiddleware, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Debe adjuntar un archivo Excel (.xlsx) en la petición (campo "file" o "excel")' });
    }

    const month = req.body.month || new Date().toISOString().substring(0, 7);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    let totalSheets = 0;
    let processedCount = 0;
    let skippedCount = 0;
    const errors = [];
    const excludedSheets = ['MODELO', 'SICOSS', 'RESUMEN', 'CUSS', 'HOJA6', 'HOJA 6', 'SAC_VAC', 'PARAMETROS'];

    const { data: allEmployees } = await supabase
      .from('employees')
      .select('id, cuil, name');

    for (const worksheet of workbook.worksheets) {
      const sheetNameTrimmed = worksheet.name.trim();
      const sheetNameUpper = sheetNameTrimmed.toUpperCase();

      // 1. Filtrado de Hojas de Control y Números
      if (
        worksheet.state === 'hidden' ||
        excludedSheets.includes(sheetNameUpper) ||
        /^\d+$/.test(sheetNameTrimmed)
      ) {
        continue;
      }

      totalSheets++;

      // 2. Extracción y generación de Buffers PDF independientes (Duplicado B2:G77 y Original B80:G153)
      const { dupBuffer, origBuffer } = await pdfService.excelToPdfBuffer(worksheet);

      // 3. Extraer texto completo de celdas para detección de CUIL y matcheo
      let worksheetText = '';
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          let val = '';
          if (cell.value != null) {
            if (cell.text != null && cell.text !== '') val = String(cell.text);
            else if (typeof cell.value === 'object') {
              if (cell.value.result != null) val = String(cell.value.result);
              else if (Array.isArray(cell.value.richText)) val = cell.value.richText.map(rt => rt.text || '').join('');
              else if (cell.value.text != null) val = String(cell.value.text);
              else val = String(cell.value);
            } else val = String(cell.value);
          }
          if (val.trim()) worksheetText += val.trim() + ' ';
        });
      });

      let analysis = await pdfService.analyzeBuffer(dupBuffer, worksheet.name);

      // Buscar CUILs en el texto
      const foundCuils = [];
      const cuilRegex = /(?:CUIL|CUIT)?\s*[:.-]?\s*(\d{2}[-.\s]?\d{8}[-.\s]?\d{1}|\d{11})/gi;
      const fullTextToScan = `${analysis.text || ''} ${worksheetText}`;
      let match;
      while ((match = cuilRegex.exec(fullTextToScan)) !== null) {
        const cleanMatch = (match[1] || match[0]).replace(/\D/g, '');
        if (pdfService.isValidCUIL(cleanMatch) && !foundCuils.includes(cleanMatch)) {
          foundCuils.push(cleanMatch);
        }
      }

      // Matcheo con Empleado en Base de Datos por CUIL o por Nombre de Hoja
      let employee = null;
      let matchedCuil = null;

      for (const cuilCandidate of foundCuils) {
        const candidateFormatted = pdfService.formatCUIL(cuilCandidate);
        const emp = (allEmployees || []).find(e => {
          const empClean = String(e.cuil || '').replace(/\D/g, '');
          return empClean === cuilCandidate || e.cuil === cuilCandidate || e.cuil === candidateFormatted;
        });

        if (emp) {
          employee = emp;
          matchedCuil = cuilCandidate;
          break;
        }
      }

      if (!employee) {
        const sheetClean = sheetNameTrimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        employee = (allEmployees || []).find(e => {
          const empNameClean = (e.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          return sheetClean.includes(empNameClean) || empNameClean.includes(sheetClean);
        });
        if (employee) {
          matchedCuil = String(employee.cuil || '').replace(/\D/g, '');
        }
      }

      if (!employee) {
        const reportedCuil = foundCuils.length > 0 ? foundCuils.join(', ') : 'no detectado';
        errors.push({ sheet: worksheet.name, cuil: reportedCuil, error: `No se encontró un empleado registrado para la hoja '${worksheet.name}'` });
        continue;
      }

      analysis.cuil = matchedCuil || String(employee.cuil || '').replace(/\D/g, '');
      analysis.formattedCuil = pdfService.formatCUIL(analysis.cuil);

      // Verificación si ya existe el recibo completo para ese mes
      const { data: existingPayslip } = await supabase
        .from('payslips')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('month', month)
        .maybeSingle();

      if (existingPayslip && existingPayslip.original_storage_path && existingPayslip.duplicado_storage_path) {
        skippedCount++;
        continue;
      }

      // 4. Hashes y Rutas de Supabase Storage
      const origHash = pdfService.getBufferHash(origBuffer);
      const dupHash = pdfService.getBufferHash(dupBuffer);

      const cleanSheetName = pdfService.sanitizeFileName(worksheet.name);
      const origStoragePath = `originals/${uuidv4()}_${cleanSheetName}_original.pdf`;
      const dupStoragePath = `duplicados/${uuidv4()}_${cleanSheetName}_duplicado.pdf`;

      // 5. Persistencia en Supabase Storage directamente desde memoria
      const [origUpload, dupUpload] = await Promise.all([
        supabase.storage.from('payslips').upload(origStoragePath, origBuffer, { contentType: 'application/pdf', upsert: true }),
        supabase.storage.from('payslips').upload(dupStoragePath, dupBuffer, { contentType: 'application/pdf', upsert: true })
      ]);

      if (origUpload.error || dupUpload.error) {
        errors.push({ sheet: worksheet.name, error: `Error subiendo archivos a Storage: ${origUpload.error?.message || dupUpload.error?.message}` });
        continue;
      }

      // 6. Guardar/Actualizar en Supabase PostgreSQL (tabla 'payslips')
      if (existingPayslip) {
        await supabase
          .from('payslips')
          .update({
            original_storage_path: origStoragePath,
            duplicado_storage_path: dupStoragePath,
            original_hash: origHash,
            duplicado_hash: dupHash,
            status: 'Cargado'
          })
          .eq('id', existingPayslip.id);
      } else {
        await supabase
          .from('payslips')
          .insert([{
            employee_id: employee.id,
            detected_cuil: analysis.cuil,
            month,
            original_storage_path: origStoragePath,
            duplicado_storage_path: dupStoragePath,
            original_hash: origHash,
            duplicado_hash: dupHash,
            status: 'Cargado',
            token: uuidv4(),
            financial_data: analysis.financialData
          }]);
      }

      processedCount++;
    }

    res.json({
      success: true,
      message: 'Ingesta de Excel procesada correctamente',
      total: totalSheets,
      successCount: processedCount,
      skippedCount,
      failCount: errors.length,
      errors,
      summary: {
        totalSheets,
        processedCount,
        skippedCount,
        errors
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error en ingesta masiva de Excel', details: err.message });
  }
});

/**
 * Handler genérico para firma de recibo por Token o ID
 * Acepta payloads con { signatureImage, signatureBase64, position, analytics }
 */
async function handleSignByToken(req, res) {
  try {
    const identifier = req.params.id || req.params.token;
    const { signatureImage, signatureBase64, position, analytics } = req.body;
    const finalSignature = signatureImage || signatureBase64;

    if (!identifier) {
      return res.status(400).json({ error: 'ID o token de firma requerido' });
    }

    if (!finalSignature) {
      return res.status(400).json({ error: 'La imagen de firma es requerida' });
    }

    // 1. Obtener recibo y datos del empleado asociado por ID o por Token
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    let query = supabase
      .from('payslips')
      .select(`
        *,
        employees (
          id,
          name,
          cuil,
          email
        )
      `);

    if (isUuid) {
      query = query.or(`id.eq.${identifier},token.eq.${identifier}`);
    } else {
      query = query.eq('token', identifier);
    }

    const { data: payslip, error: fetchErr } = await query.maybeSingle();

    if (fetchErr || !payslip) {
      return res.status(404).json({ error: 'Recibo no encontrado con el ID o token provisto' });
    }

    if (payslip.status === 'Firmado') {
      return res.status(400).json({ error: 'El recibo ya ha sido firmado con anterioridad' });
    }

    // 2. Descargar el PDF Duplicado desde Supabase Storage
    const dupPath = payslip.duplicado_storage_path || payslip.original_storage_path || payslip.file_path;
    if (!dupPath) {
      return res.status(404).json({ error: 'No se encontró el archivo PDF para firmar en Storage' });
    }

    const { data: dupBlob, error: downloadErr } = await supabase.storage
      .from('payslips')
      .download(dupPath);

    if (downloadErr || !dupBlob) {
      return res.status(404).json({ error: `Error descargando PDF de Storage: ${downloadErr?.message || 'Archivo no encontrado'}` });
    }

    const dupBuffer = Buffer.from(await dupBlob.arrayBuffer());

    // 3. Aplicar Firma Electrónica y Estampa Auditoría con pdf-lib
    const clientIp = req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1';
    const signedBuffer = await pdfService.signPdfBuffer(dupBuffer, finalSignature, {
      name: payslip.employees?.name || payslip.employee_name || 'Empleado',
      cuil: payslip.employees?.cuil || payslip.detected_cuil,
      ip: String(clientIp).split(',')[0].trim(),
      timestamp: new Date().toISOString(),
      token: payslip.token || identifier,
      position,
      analytics
    });

    // 4. Subir el PDF Firmado a Supabase Storage (carpeta /signed)
    const signedStoragePath = `signed/${uuidv4()}_signed.pdf`;
    const { error: uploadSignedErr } = await supabase.storage
      .from('payslips')
      .upload(signedStoragePath, signedBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadSignedErr) {
      throw new Error(`Error al guardar PDF firmado en Storage: ${uploadSignedErr.message}`);
    }

    // 5. Actualizar estado y trazabilidad en Base de Datos Postgres
    const { data: updatedPayslip, error: updateErr } = await supabase
      .from('payslips')
      .update({
        status: 'Firmado',
        signed_storage_path: signedStoragePath,
        signed_at: new Date().toISOString(),
        ip_address: String(clientIp).split(',')[0].trim(),
        user_agent: req.headers['user-agent'] || 'Desconocido'
      })
      .eq('id', payslip.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    res.json({
      success: true,
      message: 'Recibo firmado exitosamente',
      payslip: enrichPayslipWithUrls(updatedPayslip)
    });
  } catch (err) {
    console.error('Error en firma de recibo:', err);
    res.status(500).json({ error: 'Error al procesar firma de recibo', details: err.message });
  }
}

// Rutas POST para firma de recibos por Token o ID
router.post('/sign/:token', handleSignByToken);
router.post('/sign-by-id/:id', handleSignByToken);
router.post('/:id/sign', handleSignByToken);

/**
 * Handler reutilizable de envío de email para un recibo por su ID.
 * Centralizado para ser montado en múltiples rutas alias.
 */
async function sendEmailHandler(req, res) {
  try {
    const { id } = req.params;
    const { data: payslip, error } = await supabase
      .from('payslips')
      .select('*, employees(name, email)')
      .eq('id', id)
      .single();

    if (error || !payslip) {
      return res.status(404).json({ error: 'Recibo no encontrado' });
    }

    const employeeEmail = payslip.employees?.email;
    const employeeName = payslip.employees?.name || 'Empleado';

    if (!employeeEmail) {
      return res.status(400).json({ error: 'El empleado no tiene una dirección de email asociada' });
    }

    const result = await emailService.sendPayslipSignatureNotification({
      to: employeeEmail,
      employeeName,
      month: payslip.month,
      token: payslip.token
    });

    const sentAt = new Date().toISOString();
    const { data: updatedPayslip, error: updateErr } = await supabase
      .from('payslips')
      .update({
        status: 'ENVIADO',
        sent_at: sentAt
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error(`[sendEmailHandler] Error actualizando status de recibo ${id}:`, updateErr);
    }

    res.json({
      success: true,
      message: `Notificación enviada a ${employeeEmail}`,
      payslip: updatedPayslip ? enrichPayslipWithUrls(updatedPayslip) : undefined,
      details: result
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar notificación por correo', details: err.message });
  }
}

/**
 * POST /api/payslips/:id/send-email   — ruta canónica del backend
 * POST /api/payslips/send/:id         — alias para compatibilidad con PayslipsTab.jsx y DashboardTab.jsx
 * FIX BUG-001: el frontend usaba /send/:id que retornaba 404.
 */
router.post('/:id/send-email', sendEmailHandler);
router.post('/send/:id', sendEmailHandler);

/**
 * POST /api/payslips/send-bulk
 * Envío masivo de notificaciones de firma a una lista de IDs de recibos.
 * FIX BUG-001: endpoint faltante consumido desde DashboardTab.jsx y PayslipsTab.jsx.
 *
 * Body: { ids: string[] }
 */
router.post('/send-bulk', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar un arreglo de IDs de recibos en el campo "ids"' });
    }

    const results  = [];
    const errors   = [];

    for (const id of ids) {
      try {
        const { data: payslip, error } = await supabase
          .from('payslips')
          .select('*, employees(name, email)')
          .eq('id', id)
          .single();

        if (error || !payslip) {
          errors.push({ id, error: 'Recibo no encontrado' });
          continue;
        }

        const employeeEmail = payslip.employees?.email;
        const employeeName  = payslip.employees?.name || 'Empleado';

        if (!employeeEmail) {
          errors.push({ id, error: 'El empleado no tiene email registrado' });
          continue;
        }

        const result = await emailService.sendPayslipSignatureNotification({
          to: employeeEmail,
          employeeName,
          month: payslip.month,
          token: payslip.token
        });

        const sentAt = new Date().toISOString();
        await supabase
          .from('payslips')
          .update({
            status: 'ENVIADO',
            sent_at: sentAt
          })
          .eq('id', id);

        results.push({ id, email: employeeEmail, ...result });
      } catch (innerErr) {
        errors.push({ id, error: innerErr.message });
      }
    }

    res.json({
      success: true,
      message: `Enviados: ${results.length}, Errores: ${errors.length}`,
      sent: results,
      errors
    });
  } catch (err) {
    res.status(500).json({ error: 'Error en envío masivo de notificaciones', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payslips/view/:id/:type?   – Previsualización / Streaming de PDF por ID o Token
// type: 'original' | 'duplicado' | 'signed'
// ─────────────────────────────────────────────────────────────────────────────
async function viewPayslipHandler(req, res) {
  try {
    const { id, type } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Se requiere ID o token del recibo' });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let query = supabase.from('payslips').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${id},token.eq.${id}`);
    } else {
      query = query.eq('token', id);
    }

    const { data: payslip, error } = await query.maybeSingle();

    if (error || !payslip) {
      return res.status(404).json({ error: 'Recibo no encontrado' });
    }

    const requestedType = (type || 'duplicado').toLowerCase();

    const pathMap = {
      original:  payslip.original_storage_path || payslip.file_path,
      duplicado: payslip.duplicado_storage_path || payslip.original_storage_path || payslip.file_path,
      signed:    payslip.signed_storage_path || payslip.duplicado_storage_path || payslip.original_storage_path || payslip.file_path
    };

    const storagePath = pathMap[requestedType];

    if (!storagePath) {
      return res.status(404).json({ error: `No existe archivo '${requestedType}' para este recibo` });
    }

    // Opción para generar URL firmada si se solicita explícitamente vía query parameter
    if (req.query.signedUrl === 'true' || req.query.redirect === 'true') {
      const { data: signedData } = await supabase.storage
        .from('payslips')
        .createSignedUrl(storagePath, 3600);

      if (signedData?.signedUrl) {
        if (req.query.redirect === 'true') {
          return res.redirect(signedData.signedUrl);
        }
        return res.json({ signedUrl: signedData.signedUrl });
      }
    }

    // Descarga y transmisión directa del buffer PDF
    const { data: blob, error: dlErr } = await supabase.storage
      .from('payslips')
      .download(storagePath);

    if (dlErr || !blob) {
      // Fallback a URL firmada con redirección si la descarga directa falla
      const { data: fallbackSigned } = await supabase.storage
        .from('payslips')
        .createSignedUrl(storagePath, 3600);

      if (fallbackSigned?.signedUrl) {
        return res.redirect(fallbackSigned.signedUrl);
      }

      return res.status(404).json({ error: `Error al descargar desde Storage: ${dlErr?.message || 'Archivo no encontrado'}` });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${requestedType}_${payslip.id}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error en viewPayslipHandler:', err);
    return res.status(500).json({ error: 'Error al visualizar recibo PDF', details: err.message });
  }
}

router.get('/view/:id/:type', viewPayslipHandler);
router.get('/view/:id', viewPayslipHandler);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/download/:type/:id   – Proxy de descarga de PDFs desde Supabase Storage
// type: 'original' | 'duplicado' | 'signed'
// ─────────────────────────────────────────────────────────────────────────────
async function downloadHandler(req, res) {
  try {
    let { type, id } = req.params;

    // Inversión o resolución flexible de parámetros (:id vs :type)
    const isParam1Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(type);
    if (isParam1Uuid && id) {
      const temp = type;
      type = id;
      id = temp;
    } else if (isParam1Uuid && !id) {
      id = type;
      type = 'signed';
    }

    if (!id) {
      return res.status(400).json({ error: 'Se requiere ID o token del recibo' });
    }

    const requestedType = (type || 'signed').toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let query = supabase.from('payslips').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${id},token.eq.${id}`);
    } else {
      query = query.eq('token', id);
    }

    const { data: payslip, error } = await query.maybeSingle();

    if (error || !payslip) {
      return res.status(404).json({ error: 'Recibo no encontrado' });
    }

    let storagePath = null;
    if (requestedType === 'signed') {
      storagePath = payslip.signed_storage_path;
      if (!storagePath) {
        return res.status(404).json({ error: 'El recibo no posee un archivo firmado aún' });
      }
    } else if (requestedType === 'original') {
      storagePath = payslip.original_storage_path || payslip.file_path;
    } else {
      storagePath = payslip.duplicado_storage_path || payslip.original_storage_path || payslip.file_path;
    }

    if (!storagePath) {
      return res.status(404).json({ error: `No se encontró el archivo '${requestedType}' para este recibo` });
    }

    // Opción para obtener Signed URL directa si se especifica via query parameter
    if (req.query.signedUrl === 'true' || req.query.redirect === 'true') {
      const { data: signedData } = await supabase.storage
        .from('payslips')
        .createSignedUrl(storagePath, 3600);

      if (signedData?.signedUrl) {
        if (req.query.redirect === 'true') {
          return res.redirect(signedData.signedUrl);
        }
        return res.json({ signedUrl: signedData.signedUrl });
      }
    }

    // Descarga y streaming de buffer con Content-Type: application/pdf
    const { data: blob, error: dlErr } = await supabase.storage
      .from('payslips')
      .download(storagePath);

    if (dlErr || !blob) {
      const { data: fallbackSigned } = await supabase.storage
        .from('payslips')
        .createSignedUrl(storagePath, 3600);

      if (fallbackSigned?.signedUrl) {
        return res.redirect(fallbackSigned.signedUrl);
      }
      return res.status(404).json({ error: `Error al descargar desde Storage: ${dlErr?.message || 'Archivo no encontrado'}` });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${requestedType}_${payslip.id}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error en downloadHandler:', err);
    return res.status(500).json({ error: 'Error al descargar PDF', details: err.message });
  }
}

router.get('/download/:type/:id', downloadHandler);
router.get('/download/file/:id/:type?', downloadHandler);
router.get('/download/signed/:id', downloadHandler);
router.get('/download/original/:id', downloadHandler);
router.get('/download/duplicado/:id', downloadHandler);

// Alias para la URL usada en PayslipsTab.jsx  (/api/download/original/:id)
// Se monta también en api/index.js bajo /api/download/
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payslips/match  – Asociación manual de recibo a empleado
// Body: { payslipId: string, employeeId: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/match', async (req, res) => {
  try {
    const { payslipId, employeeId } = req.body;

    if (!payslipId || !employeeId) {
      return res.status(400).json({ error: 'Se requieren payslipId y employeeId' });
    }

    // Verificar que el empleado existe
    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('id, cuil')
      .eq('id', employeeId)
      .single();

    if (empErr || !employee) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('payslips')
      .update({ employee_id: employeeId, updated_at: new Date().toISOString() })
      .eq('id', payslipId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    res.json({
      success: true,
      message: 'Recibo asociado correctamente al empleado',
      payslip: enrichPayslipWithUrls(updated)
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al asociar recibo', details: err.message });
  }
});

/**
 * DELETE /api/payslips/:id
 * Elimina un recibo por su ID y remueve los archivos correspondientes en Storage
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: payslip } = await supabase
      .from('payslips')
      .select('original_storage_path, duplicado_storage_path, signed_storage_path')
      .eq('id', id)
      .maybeSingle();

    if (payslip) {
      const filesToRemove = [
        payslip.original_storage_path,
        payslip.duplicado_storage_path,
        payslip.signed_storage_path
      ].filter(Boolean);

      if (filesToRemove.length > 0) {
        await supabase.storage.from('payslips').remove(filesToRemove);
      }
    }

    const { error } = await supabase.from('payslips').delete().eq('id', id);
    if (error) throw error;

    res.json({ success: true, message: 'Recibo eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar el recibo', details: err.message });
  }
});

/**
 * POST /api/payslips/delete-bulk
 * Elimina un lote de recibos por sus IDs
 */
router.post('/delete-bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar un arreglo de IDs en el campo "ids"' });
    }

    const { data: payslips } = await supabase
      .from('payslips')
      .select('original_storage_path, duplicado_storage_path, signed_storage_path')
      .in('id', ids);

    if (payslips && payslips.length > 0) {
      const filesToRemove = [];
      payslips.forEach(p => {
        if (p.original_storage_path) filesToRemove.push(p.original_storage_path);
        if (p.duplicado_storage_path) filesToRemove.push(p.duplicado_storage_path);
        if (p.signed_storage_path) filesToRemove.push(p.signed_storage_path);
      });
      if (filesToRemove.length > 0) {
        await supabase.storage.from('payslips').remove(filesToRemove);
      }
    }

    const { error } = await supabase.from('payslips').delete().in('id', ids);
    if (error) throw error;

    res.json({ success: true, message: `Se eliminaron ${ids.length} recibos correctamente` });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar recibos en lote', details: err.message });
  }
});

/**
 * POST /api/payslips/schedule
 * Programación o cancelación de envío de recibos
 */
router.post('/schedule', async (req, res) => {
  try {
    const { ids, scheduledAt } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar un arreglo de IDs en el campo "ids"' });
    }

    const newStatus = scheduledAt ? 'Programado' : 'Cargado';
    const { error } = await supabase
      .from('payslips')
      .update({
        status: newStatus,
        scheduled_at: scheduledAt || null
      })
      .in('id', ids);

    if (error) throw error;

    res.json({
      success: true,
      message: scheduledAt ? `Envío programado para ${scheduledAt}` : 'Programación cancelada'
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al programar recibos', details: err.message });
  }
});

module.exports = {
  payslipsRouter: router,
  handleSignByToken,
  enrichPayslipWithUrls,
  downloadHandler,
  getPayslipsByEmployeeHandler,
  viewPayslipHandler
};
