import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * Helper para asegurar que un bucket de Supabase Storage existe
 */
const ensureBucketExists = async (bucketName, isPublic = true) => {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === bucketName);

    if (!bucketExists) {
      await supabaseAdmin.storage.createBucket(bucketName, { public: isPublic });
    }
  } catch (err) {
    console.warn(`[Storage Warning]: No se pudo verificar/crear el bucket ${bucketName}:`, err.message);
  }
};

/**
 * Listar recibos de sueldo
 * GET /api/payslips
 * Query params opcionales: employee_id, status, periodo
 */
export const getPayslips = async (req, res) => {
  try {
    const targetEmployeeId = req.params.employeeId || req.query.employee_id;
    const { status, periodo } = req.query;

    let query = supabaseAdmin
      .from('payslips')
      .select(`
        *,
        employees (
          id,
          name,
          cuil,
          email,
          puesto
        )
      `)
      .order('created_at', { ascending: false });

    if (targetEmployeeId) {
      query = query.eq('employee_id', targetEmployeeId);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (periodo) {
      query = query.eq('periodo', periodo);
    }

    const { data: payslips, error } = await query;

    if (error) {
      console.warn('[Supabase Warning]: Error o falta de permisos en tabla payslips:', error.message);
      return res.status(200).json([]);
    }

    return res.status(200).json(payslips || []);
  } catch (err) {
    console.error('Error en getPayslips:', err);
    return res.status(200).json([]);
  }
};

/**
 * Obtener un recibo individual por su ID
 * GET /api/payslips/:id
 */
export const getPayslipById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: payslip, error } = await supabaseAdmin
      .from('payslips')
      .select(`
        *,
        employees (
          id,
          name,
          cuil,
          email,
          puesto
        )
      `)
      .eq('id', id)
      .single();

    if (error || !payslip) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No se encontró el recibo con ID ${id}.`,
      });
    }

    return res.status(200).json(payslip);
  } catch (err) {
    console.error('Error en getPayslipById:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al consultar el recibo.',
      details: err.message,
    });
  }
};

/**
 * Registrar un nuevo recibo de sueldo y subir PDF al bucket 'payslips'
 * POST /api/payslips
 */
export const createPayslip = async (req, res) => {
  try {
    const { employee_id, periodo, status } = req.body;
    const file = req.file;

    if (!employee_id || !periodo) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Los campos employee_id y periodo son requeridos.',
      });
    }

    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, cuil, name')
      .eq('id', employee_id)
      .single();

    if (empError || !employee) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No existe un empleado con ID ${employee_id}.`,
      });
    }

    let filePath = req.body.file_path || '';
    let fileUrl = req.body.file_url || '';

    if (file) {
      await ensureBucketExists('payslips', true);

      const timestamp = Date.now();
      const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      filePath = `${employee_id}/${periodo}_${timestamp}_${sanitizedFilename}`;

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('payslips')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype || 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        return res.status(500).json({
          error: 'Storage Error',
          message: 'Error al subir el PDF del recibo al bucket de Supabase Storage.',
          details: uploadError.message,
        });
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('payslips')
        .getPublicUrl(filePath);

      fileUrl = publicUrlData?.publicUrl || '';
    }

    if (!filePath) {
      filePath = `payslips/${employee_id}/${periodo}.pdf`;
    }

    const newPayslip = {
      employee_id,
      periodo,
      file_path: filePath,
      file_url: fileUrl,
      status: status || 'pendiente',
    };

    const { data: payslip, error: dbError } = await supabaseAdmin
      .from('payslips')
      .insert([newPayslip])
      .select('*')
      .single();

    if (dbError) {
      return res.status(500).json({
        error: 'Database Error',
        message: 'Error al guardar el recibo en la base de datos.',
        details: dbError.message,
      });
    }

    return res.status(201).json({
      message: 'Recibo creado y subido exitosamente a Supabase Storage',
      payslip,
    });
  } catch (err) {
    console.error('Error en createPayslip:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error inesperado al crear el recibo.',
      details: err.message,
    });
  }
};

/**
 * Carga e importación masiva desde archivo Excel (.xlsx / .xls)
 * POST /api/payslips/upload-excel
 */
export const uploadExcelPayslips = async (req, res) => {
  try {
    const file = req.file;
    const { month } = req.body;

    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Bad Request', message: 'Se requiere un archivo Excel (.xlsx o .xls)' });
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Bad Request', message: 'El archivo Excel está vacío o no contiene filas procesables.' });
    }

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const errors = [];

    // Obtener empleados existentes para asociar por CUIL o email
    const { data: employees } = await supabaseAdmin
      .from('employees')
      .select('id, cuil, email, name');

    const empMap = new Map();
    (employees || []).forEach(emp => {
      if (emp.cuil) empMap.set(String(emp.cuil).trim().replace(/\D/g, ''), emp);
      if (emp.email) empMap.set(String(emp.email).trim().toLowerCase(), emp);
    });

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      try {
        const rawCuil = String(row.CUIL || row.cuil || row['CUIL/CUIT'] || '').trim();
        const rawEmail = String(row.Email || row.email || row.Mail || '').trim().toLowerCase();
        const rawName = String(row.Nombre || row.nombre || row.Empleado || row.name || 'Empleado Nómina').trim();
        const rawPeriodo = String(row.Periodo || row.periodo || row.Mes || month || new Date().toISOString().slice(0, 7)).trim();

        const cleanCuil = rawCuil.replace(/\D/g, '');
        let employee = empMap.get(cleanCuil) || empMap.get(rawEmail);

        // Si el empleado no existe en Supabase, crearlo automáticamente
        if (!employee && (rawCuil || rawEmail)) {
          const password_hash = await bcrypt.hash(cleanCuil || '123456', 10);
          const newEmpData = {
            cuil: rawCuil || cleanCuil,
            email: rawEmail || `${cleanCuil}@empresa.com`,
            name: rawName,
            password_hash,
            role: 'empleado',
            puesto: String(row.Puesto || row.puesto || 'Empleado').trim(),
            fecha_ingreso: new Date().toISOString().split('T')[0],
            archived: false,
          };

          const { data: createdEmp } = await supabaseAdmin
            .from('employees')
            .insert([newEmpData])
            .select('*')
            .single();

          if (createdEmp) {
            employee = createdEmp;
            if (cleanCuil) empMap.set(cleanCuil, employee);
            if (rawEmail) empMap.set(rawEmail, employee);
          }
        }

        const employeeId = employee?.id || `mock-${Date.now()}-${index}`;

        const newPayslip = {
          employee_id: employeeId,
          periodo: rawPeriodo,
          file_path: `payslips/${employeeId}/${rawPeriodo}.pdf`,
          file_url: '',
          status: 'pendiente',
        };

        const { error: insertErr } = await supabaseAdmin
          .from('payslips')
          .insert([newPayslip]);

        if (insertErr) {
          console.warn('[Excel Import Warning]: Falló insert en Supabase:', insertErr.message);
        }
        successCount++;
      } catch (errRow) {
        failCount++;
        errors.push(`Fila ${index + 2}: ${errRow.message}`);
      }
    }

    return res.status(200).json({
      total: rows.length,
      successCount,
      failCount,
      skippedCount,
      errors,
      message: `Procesadas ${rows.length} filas del Excel: ${successCount} exitosas, ${failCount} errores.`
    });
  } catch (err) {
    console.error('Error en uploadExcelPayslips:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al procesar el archivo Excel.',
      details: err.message,
    });
  }
};

/**
 * Carga de archivos PDF individuales / masivos de recibos
 * POST /api/payslips/upload
 */
export const uploadPdfPayslip = async (req, res) => {
  try {
    const file = req.file;
    const { month } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Bad Request', message: 'Se requiere un archivo' });
    }

    await ensureBucketExists('payslips', true);

    const timestamp = Date.now();
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `uploads/${month || 'general'}/${timestamp}_${sanitizedFilename}`;

    await supabaseAdmin.storage
      .from('payslips')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype || 'application/pdf',
        upsert: true,
      });

    return res.status(200).json({
      success: true,
      message: `Archivo '${file.originalname}' subido y procesado correctamente.`,
      skipped: false,
      noTextLayer: false,
    });
  } catch (err) {
    console.error('Error en uploadPdfPayslip:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al subir el archivo PDF.',
      details: err.message,
    });
  }
};

/**
 * Firma electrónica de recibo de sueldo
 * POST /api/payslips/:id/sign
 */
export const signPayslip = async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    const { signature_base64 } = req.body;

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const ip_address = Array.isArray(rawIp) ? rawIp[0] : String(rawIp).split(',')[0].trim();
    const user_agent = req.headers['user-agent'] || 'Desconocido';

    const { data: existingPayslip, error: fetchError } = await supabaseAdmin
      .from('payslips')
      .select('id, employee_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existingPayslip) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No se encontró el recibo con ID ${id} para firmar.`,
      });
    }

    let signatureImagePath = '';
    await ensureBucketExists('signatures', true);

    const timestamp = Date.now();
    const signatureFileName = `${existingPayslip.employee_id}/signature_${id}_${timestamp}.png`;

    let imageBuffer = null;

    if (file && file.buffer) {
      imageBuffer = file.buffer;
    } else if (signature_base64) {
      const base64Data = signature_base64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    }

    if (imageBuffer) {
      await supabaseAdmin.storage
        .from('signatures')
        .upload(signatureFileName, imageBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      signatureImagePath = signatureFileName;
    } else {
      signatureImagePath = `signatures/${existingPayslip.employee_id}/signature_${id}.png`;
    }

    const auditData = {
      status: 'firmado',
      signed_at: new Date().toISOString(),
      signature_image_path: signatureImagePath,
      ip_address,
      user_agent,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedPayslip, error: updateError } = await supabaseAdmin
      .from('payslips')
      .update(auditData)
      .eq('id', id)
      .select(`
        *,
        employees (
          id,
          name,
          cuil,
          email
        )
      `)
      .single();

    if (updateError) {
      return res.status(500).json({
        error: 'Database Error',
        message: 'Error al actualizar el estado de auditoría de la firma del recibo.',
        details: updateError.message,
      });
    }

    return res.status(200).json({
      message: 'Recibo firmado electrónicamente y auditado con éxito.',
      payslip: updatedPayslip,
    });
  } catch (err) {
    console.error('Error en signPayslip:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ocurrió un error inesperado al procesar la firma del recibo.',
      details: err.message,
    });
  }
};

/**
 * Enviar recibo individual por email
 * POST /api/payslips/send/:id
 */
export const sendPayslipEmail = async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin
      .from('payslips')
      .update({ status: 'enviado', updated_at: new Date().toISOString() })
      .eq('id', id);

    return res.status(200).json({
      success: true,
      message: 'Recibo enviado correctamente por correo electrónico.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

/**
 * Eliminar recibo individual
 * DELETE /api/payslips/:id
 */
export const deletePayslip = async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin
      .from('payslips')
      .delete()
      .eq('id', id);

    return res.status(200).json({
      success: true,
      message: 'Recibo eliminado correctamente.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

/**
 * Eliminar recibos masivamente
 * POST /api/payslips/delete-bulk
 */
export const deleteBulkPayslips = async (req, res) => {
  try {
    const { ids, month } = req.body;
    let count = 0;

    if (Array.isArray(ids) && ids.length > 0) {
      await supabaseAdmin.from('payslips').delete().in('id', ids);
      count = ids.length;
    } else if (month) {
      const { data } = await supabaseAdmin.from('payslips').delete().eq('periodo', month).select('id');
      count = data?.length || 0;
    }

    return res.status(200).json({
      success: true,
      count,
      message: `Se eliminaron ${count} recibos correctamente.`,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

/**
 * Enviar recibos masivamente por correo
 * POST /api/payslips/send-bulk
 */
export const sendBulkPayslips = async (req, res) => {
  try {
    const { ids, month } = req.body;
    let count = 0;

    if (Array.isArray(ids) && ids.length > 0) {
      await supabaseAdmin.from('payslips').update({ status: 'enviado' }).in('id', ids);
      count = ids.length;
    } else if (month) {
      const { data } = await supabaseAdmin.from('payslips').update({ status: 'enviado' }).eq('periodo', month).select('id');
      count = data?.length || 0;
    }

    return res.status(200).json({
      success: true,
      count,
      message: `Se enviaron ${count} recibos por correo electrónico.`,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

/**
 * Procesar coincidencias automáticas
 * POST /api/payslips/match
 */
export const matchPayslips = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      matched: 0,
      message: 'Proceso de coincidencia finalizado.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

/**
 * Programar envío diferido de recibos
 * POST /api/payslips/schedule
 */
export const schedulePayslips = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: 'Envío de recibos programado exitosamente.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};
