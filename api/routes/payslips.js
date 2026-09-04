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
 * Carga masiva desde Excel (.xls y .xlsx) usando exceljs de forma nativa para Vercel (Buffers en memoria).
 * Soporta hojas con imágenes embebidas de recibos o solapas con celdas de texto.
 */
router.post('/upload-excel', fileUploadMiddleware, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No se subió ningún archivo Excel" });
    }
    const { month, jobId } = req.body;
    if (!month) {
      return res.status(400).json({ error: "El período (month) es requerido (ej: '2026-05')" });
    }

    console.log(`[EXCEL] Upload start. month=${month}, jobId=${jobId || 'N/A'}`);

    const summary = {
      total: 0,
      successCount: 0,
      failCount: 0,
      skippedCount: 0,
      errors: []
    };

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const excludedSheets = ['RESUMEN', 'SICOSS', 'MODELO', 'CUSS', 'HOJA6', 'HOJA 6', 'PARAMETROS'];
    const validWorksheets = workbook.worksheets.filter(ws => {
      const nameUpper = ws.name.toUpperCase().trim();
      return ws.state !== 'hidden' && !excludedSheets.includes(nameUpper);
    });

    summary.total = validWorksheets.length;

    if (jobId) {
      if (!global.excelProgress) global.excelProgress = {};
      global.excelProgress[jobId] = { current: 0, total: summary.total };
    }

    const { data: allEmployees, error: empErr } = await supabase
      .from('employees')
      .select('id, cuil, name, email');
    if (empErr) throw empErr;

    const { data: allPayslips, error: payErr } = await supabase
      .from('payslips')
      .select('id, employee_id, month, original_hash, duplicado_hash, original_storage_path, duplicado_storage_path');
    if (payErr) throw payErr;

    for (let i = 0; i < validWorksheets.length; i++) {
      const worksheet = validWorksheets[i];
      const sheetName = worksheet.name.trim();

      try {
        // Generar buffers de PDF (Duplicado y Original) desde la solapa
        const sheetBuffers = await pdfService.excelWorksheetToPdfBuffers(workbook, worksheet);
        origBytes = sheetBuffers.origBuffer;
        dupBytes = sheetBuffers.dupBuffer;
        fileHash = pdfService.getBufferHash(dupBytes);

        // Extraer texto de celdas y analizar metadatos/CUIL
        let worksheetText = '';
        worksheet.eachRow((row) => {
          row.eachCell((cell) => {
            let val = cell.value;
            if (val != null) {
              if (typeof val === 'object') val = val.result || val.text || '';
              val = String(val).trim();
              if (val) worksheetText += val + ' ';
            }
          });
        });

        analysis = await pdfService.analyzeBuffer(sheetBuffers.fullPdfBuffer, sheetName);
        const fullTextToScan = `${analysis.text || ''} ${worksheetText}`;

        // Recopilar CUILs válidos
        const foundCuils = [];
        const cuilRegex = /(?:CUIL|CUIT)?\s*[:.-]?\s*(\d{2}[-.\s]?\d{8}[-.\s]?\d{1}|\d{11})/gi;
        let match;
        while ((match = cuilRegex.exec(fullTextToScan)) !== null) {
          const cleanMatch = (match[1] || match[0]).replace(/\D/g, '');
          if (pdfService.isValidCUIL(cleanMatch) && !foundCuils.includes(cleanMatch)) {
            foundCuils.push(cleanMatch);
          }
        }
        if (foundCuils.length > 0 && !analysis.cuil) {
          analysis.cuil = foundCuils[0];
        }

        // Matcheo de empleado por CUILs detectados o Nombre de solapa
        let employeeId = null;
        let detectedCuil = analysis.cuil;
        let matchedEmp = null;

        for (const c of foundCuils) {
          const cleanC = String(c).replace(/\D/g, '');
          const emp = (allEmployees || []).find(e => {
            const empClean = String(e.cuil || '').replace(/\D/g, '');
            return empClean === cleanC;
          });
          if (emp) {
            matchedEmp = emp;
            employeeId = emp.id;
            detectedCuil = cleanC;
            break;
          }
        }

        // Fallback: Si no se detectó CUIL que matchee, emparejar por el nombre de la solapa con el empleado
        if (!employeeId) {
          const sheetClean = sheetName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          matchedEmp = (allEmployees || []).find(e => {
            const empNameClean = (e.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            return sheetClean.includes(empNameClean) || empNameClean.includes(sheetClean);
          });
          if (matchedEmp) {
            employeeId = matchedEmp.id;
            detectedCuil = String(matchedEmp.cuil || '').replace(/\D/g, '');
            console.log(`[EXCEL] Solapa "${sheetName}": Empleado emparejado por nombre (Fallback OCR) -> ${matchedEmp.name}`);
          }
        }

        if (!employeeId) {
          summary.failCount++;
          summary.errors.push(`Solapa "${sheetName}": No se subió porque no se detectó el CUIT por OCR ni se encontró empleado con ese nombre.`);
          continue;
        }

        // Comprobar duplicado global por hash
        if (fileHash) {
          const isDuplicate = (allPayslips || []).some(p =>
            p.original_hash === fileHash || p.duplicado_hash === fileHash
          );
          if (isDuplicate) {
            summary.errors.push(`Solapa "${sheetName}": El recibo exacto ya fue subido (Duplicado global).`);
            summary.skippedCount++;
            continue;
          }
        }

        // Comprobar si ya existe un recibo completo para este empleado y mes
        const existingRecord = (allPayslips || []).find(
          p => (p.employee_id === employeeId || p.detected_cuil === detectedCuil) && p.month === month
        );

        if (existingRecord && existingRecord.original_storage_path && existingRecord.duplicado_storage_path) {
          summary.skippedCount++;
          summary.errors.push(`Solapa "${sheetName}": Se omitió porque ya existe un recibo cargado para este empleado en el período ${month}.`);
          continue;
        }

        const origHash = pdfService.getBufferHash(origBytes);
        const dupHash = pdfService.getBufferHash(dupBytes);
        const cleanSheetName = pdfService.sanitizeFileName(matchedEmp ? matchedEmp.name : sheetName);

        const origFilename = `${uuidv4()}_${cleanSheetName}_original.pdf`;
        const dupFilename = `${uuidv4()}_${cleanSheetName}_duplicado.pdf`;

        const origStoragePath = `originals/${origFilename}`;
        const dupStoragePath = `duplicados/${dupFilename}`;

        // Subida de Buffers a Supabase Storage
        const [origUpload, dupUpload] = await Promise.all([
          supabase.storage.from('payslips').upload(origStoragePath, origBytes, { contentType: 'application/pdf', upsert: true }),
          supabase.storage.from('payslips').upload(dupStoragePath, dupBytes, { contentType: 'application/pdf', upsert: true })
        ]);

        if (origUpload.error || dupUpload.error) {
          summary.failCount++;
          summary.errors.push(`Solapa "${sheetName}": Error subiendo archivos a Storage: ${origUpload.error?.message || dupUpload.error?.message}`);
          continue;
        }

        // Guardar o actualizar registro en Postgres DB via Supabase
        if (existingRecord) {
          await supabase
            .from('payslips')
            .update({
              original_storage_path: origStoragePath,
              duplicado_storage_path: dupStoragePath,
              original_hash: origHash,
              duplicado_hash: dupHash,
              status: 'Cargado',
              financial_data: analysis.financialData || existingRecord.financial_data,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingRecord.id);
        } else {
          await supabase
            .from('payslips')
            .insert([{
              employee_id: employeeId,
              detected_cuil: detectedCuil,
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

        summary.successCount++;

      } catch (err) {
        summary.failCount++;
        summary.errors.push(`Error procesando solapa "${sheetName}": ${err.message}`);
      }

      if (jobId && global.excelProgress) {
        global.excelProgress[jobId].current = i + 1;
      }
    }

    if (jobId && global.excelProgress) {
      delete global.excelProgress[jobId];
    }

    res.json({
      success: true,
      message: 'Subida masiva procesada correctamente',
      total: summary.total,
      successCount: summary.successCount,
      failCount: summary.failCount,
      skippedCount: summary.skippedCount,
      errors: summary.errors,
      summary
    });
  } catch (error) {
    console.error("Error en la subida Excel:", error);
    res.status(500).json({ error: error.message });
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

    res.json({
      success: true,
      message: `Notificación enviada a ${employeeEmail}`,
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
