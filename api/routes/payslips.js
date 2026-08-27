const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const { supabase } = require('../lib/supabase');
const pdfService = require('../lib/pdfService');
const emailService = require('../services/emailService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware para capturar archivo sea en campo 'file', 'pdf' o 'excel'
const fileUploadMiddleware = upload.single('file');

/**
 * Helper para obtener BASE_URL formateada sin barra final
 */
function getBaseUrl() {
  return (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
}

/**
 * Helper para enriquecer objetos de recibo con URLs completas (firma / previsualización)
 */
function enrichPayslipWithUrls(payslip) {
  if (!payslip) return null;
  const baseUrl = getBaseUrl();
  return {
    ...payslip,
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
 * POST /api/payslips/upload
 * Subida individual de PDF (Original o Duplicado)
 */
router.post('/upload', fileUploadMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar un archivo PDF en la petición (campo "file")' });
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
      return res.status(400).json({ error: 'El archivo ya fue subido previamente (duplicado)' });
    }

    // 2. Análisis del Buffer PDF y extracción de CUIL
    const analysis = await pdfService.analyzeBuffer(fileBuffer, originalFilename);
    if (!analysis.cuil) {
      return res.status(400).json({ error: 'No se pudo detectar un CUIL válido en el documento' });
    }

    // 3. Buscar empleado en la base de datos por CUIL
    const formatted = pdfService.formatCUIL(analysis.cuil);
    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('id, cuil, name, email')
      .or(`cuil.eq.${analysis.cuil},cuil.eq.${formatted}`)
      .maybeSingle();

    if (empErr || !employee) {
      return res.status(404).json({ error: `No se encontró un empleado registrado con el CUIL ${analysis.cuil}` });
    }

    // 4. Subida del Buffer a Supabase Storage (Bucket 'payslips')
    const storageFolder = analysis.type === 'duplicado' ? 'duplicados' : 'originals';
    const storagePath = `${storageFolder}/${uuidv4()}_${originalFilename}`;

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
        status: 'Cargado',
        updated_at: new Date().toISOString()
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
      payslip: resultPayslip,
      analysis
    });
  } catch (err) {
    res.status(500).json({ error: 'Error en procesamiento de recibo', details: err.message });
  }
});

/**
 * POST /api/payslips/upload-excel
 * Carga masiva de Excel (.xlsx) con procesamiento en memoria y split geométrico
 */
router.post('/upload-excel', fileUploadMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar un archivo Excel (.xlsx) en el campo "file"' });
    }

    const month = req.body.month || new Date().toISOString().substring(0, 7);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    let totalSheets = 0;
    let processedCount = 0;
    let skippedCount = 0;
    const errors = [];
    const excludedSheets = ['RESUMEN', 'SICOSS', 'MODELO', 'CUSS', 'HOJA6', 'HOJA 6', 'PARAMETROS'];

    for (const worksheet of workbook.worksheets) {
      const sheetNameUpper = worksheet.name.toUpperCase().trim();
      if (worksheet.state === 'hidden' || excludedSheets.includes(sheetNameUpper)) {
        continue;
      }

      totalSheets++;

      // 1. Generación de PDF A4 en memoria a partir de la solapa de Excel
      const sheetPdfBuffer = await pdfService.excelToPdfBuffer(worksheet);

      // 2. Análisis estricto de CUIL impreso
      const analysis = await pdfService.analyzeBuffer(sheetPdfBuffer, worksheet.name);
      if (!analysis.cuil) {
        errors.push({ sheet: worksheet.name, error: 'No se detectó un CUIL válido impreso en la hoja' });
        continue;
      }

      // 3. Matcheo con Empleado en Base de Datos
      const formatted = pdfService.formatCUIL(analysis.cuil);
      const { data: employee } = await supabase
        .from('employees')
        .select('id, cuil, name')
        .or(`cuil.eq.${analysis.cuil},cuil.eq.${formatted}`)
        .maybeSingle();

      if (!employee) {
        errors.push({ sheet: worksheet.name, cuil: analysis.cuil, error: `El CUIL ${analysis.cuil} no corresponde a ningún empleado` });
        continue;
      }

      // 4. Verificación de existencia de recibo completo para el mes
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

      // 5. División Geométrica con pdf-lib (Mitad Superior: Duplicado / Mitad Inferior: Original)
      const { origBuffer, dupBuffer } = await pdfService.splitPdfBuffer(sheetPdfBuffer);
      const origHash = pdfService.getBufferHash(origBuffer);
      const dupHash = pdfService.getBufferHash(dupBuffer);

      // 6. Subida de Buffers a Supabase Storage
      const origStoragePath = `originals/${uuidv4()}_${worksheet.name}_original.pdf`;
      const dupStoragePath = `duplicados/${uuidv4()}_${worksheet.name}_duplicado.pdf`;

      const [origUpload, dupUpload] = await Promise.all([
        supabase.storage.from('payslips').upload(origStoragePath, origBuffer, { contentType: 'application/pdf', upsert: true }),
        supabase.storage.from('payslips').upload(dupStoragePath, dupBuffer, { contentType: 'application/pdf', upsert: true })
      ]);

      if (origUpload.error || dupUpload.error) {
        errors.push({ sheet: worksheet.name, error: `Error subiendo archivos a Storage: ${origUpload.error?.message || dupUpload.error?.message}` });
        continue;
      }

      // 7. Guardar/Actualizar en Base de Datos PostgreSQL
      if (existingPayslip) {
        await supabase
          .from('payslips')
          .update({
            original_storage_path: origStoragePath,
            duplicado_storage_path: dupStoragePath,
            original_hash: origHash,
            duplicado_hash: dupHash,
            status: 'Cargado',
            updated_at: new Date().toISOString()
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
 * Handler genérico para firma de recibo por Token
 * (Exportado para ser reutilizado en /api/sign/:token)
 */
async function handleSignByToken(req, res) {
  try {
    const { token } = req.params;
    const { signatureImage, position } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token de firma requerido' });
    }

    // 1. Obtener recibo y datos del empleado asociado
    const { data: payslip, error: fetchErr } = await supabase
      .from('payslips')
      .select(`
        *,
        employees (
          id,
          name,
          cuil,
          email
        )
      `)
      .eq('token', token)
      .maybeSingle();

    if (fetchErr || !payslip) {
      return res.status(404).json({ error: 'Token de firma inválido o recibo no encontrado' });
    }

    if (payslip.status === 'Firmado') {
      return res.status(400).json({ error: 'El recibo ya ha sido firmado con anterioridad' });
    }

    // 2. Descargar el PDF Duplicado desde Supabase Storage
    const dupPath = payslip.duplicado_storage_path || payslip.original_storage_path;
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
    const signedBuffer = await pdfService.signPdfBuffer(dupBuffer, signatureImage, {
      name: payslip.employees?.name || 'Empleado',
      cuil: payslip.employees?.cuil || payslip.detected_cuil,
      ip: String(clientIp).split(',')[0].trim(),
      timestamp: new Date().toISOString(),
      token: payslip.token,
      position
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
        user_agent: req.headers['user-agent'] || 'Desconocido',
        updated_at: new Date().toISOString()
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
    res.status(500).json({ error: 'Error al procesar firma de recibo', details: err.message });
  }
}

// Ruta POST /api/payslips/sign/:token
router.post('/sign/:token', handleSignByToken);

/**
 * POST /api/payslips/:id/send-email
 * Envía la notificación por correo electrónico con enlace directo de firma
 */
router.post('/:id/send-email', async (req, res) => {
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
});

module.exports = {
  payslipsRouter: router,
  handleSignByToken,
  enrichPayslipWithUrls
};
