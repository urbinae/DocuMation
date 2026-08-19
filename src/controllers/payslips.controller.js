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
    const { employee_id, status, periodo } = req.query;

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

    if (employee_id) {
      query = query.eq('employee_id', employee_id);
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
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ocurrió un error al obtener la lista de recibos.',
      details: err.message,
    });
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
    const file = req.file; // Proporcionado por Multer middleware si es multipart/form-data

    if (!employee_id || !periodo) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Los campos employee_id y periodo son requeridos.',
      });
    }

    // Verificar si el empleado existe en Supabase
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

    // Si se sube un archivo físico PDF en el request
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

      // Obtener URL pública del archivo cargado
      const { data: publicUrlData } = supabaseAdmin.storage
        .from('payslips')
        .getPublicUrl(filePath);

      fileUrl = publicUrlData?.publicUrl || '';
    }

    if (!filePath) {
      filePath = `payslips/${employee_id}/${periodo}.pdf`;
    }

    // Registrar en la tabla payslips de Supabase PostgreSQL
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
      message: 'Recibo creado e subido exitosamente a Supabase Storage',
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
 * Firma electrónica de recibo de sueldo
 * POST /api/payslips/:id/sign
 *
 * Registra los campos de auditoría (signed_at, ip_address, user_agent, status = 'firmado')
 * y sube la firma en PNG al bucket 'signatures'.
 */
export const signPayslip = async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file; // Si se envía como multipart
    const { signature_base64 } = req.body; // O si se envía como Base64 string

    // 1. Obtener la IP del cliente y el User-Agent
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const ip_address = Array.isArray(rawIp) ? rawIp[0] : String(rawIp).split(',')[0].trim();
    const user_agent = req.headers['user-agent'] || 'Desconocido';

    // 2. Verificar existencia del recibo en Supabase
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

    // 3. Procesar y guardar la imagen de la firma PNG en Supabase Storage (bucket 'signatures')
    let signatureImagePath = '';
    await ensureBucketExists('signatures', true);

    const timestamp = Date.now();
    const signatureFileName = `${existingPayslip.employee_id}/signature_${id}_${timestamp}.png`;

    let imageBuffer = null;

    if (file && file.buffer) {
      imageBuffer = file.buffer;
    } else if (signature_base64) {
      // Remover encabezado Data-URL si existe (ej. "data:image/png;base64,")
      const base64Data = signature_base64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    }

    if (imageBuffer) {
      const { data: storageData, error: storageError } = await supabaseAdmin.storage
        .from('signatures')
        .upload(signatureFileName, imageBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (storageError) {
        console.error('Error al guardar la firma en Storage:', storageError);
        return res.status(500).json({
          error: 'Storage Error',
          message: 'Error al almacenar la firma PNG en Supabase Storage.',
          details: storageError.message,
        });
      }

      signatureImagePath = signatureFileName;
    } else {
      signatureImagePath = `signatures/${existingPayslip.employee_id}/signature_${id}.png`;
    }

    // 4. Actualizar el registro en la tabla payslips con campos de auditoría
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
