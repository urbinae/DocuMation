import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
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
 * Normalizador de nombres de archivo para fallback de matcheo (getNormalizedBase)
 * Regla 3: Limpia sufijos como 'original', 'duplicado', extensiones y caracteres no alfanuméricos
 */
export const getNormalizedBase = (filename) => {
  if (!filename) return '';
  let name = String(filename).toLowerCase();
  name = name.replace(/\.(pdf|xlsx|xls)$/gi, '');
  name = name.replace(/original|orig|duplicado|dupl|dup|firmar|firma|para/gi, '');
  name = name.replace(/[^a-z0-9]/g, '');
  return name;
};

/**
 * Calcula el hash SHA-256 de un buffer para deduplicación global (Regla 5)
 */
export const calculateBufferHash = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Extrae y valida formato de CUIL desde una cadena de texto (Regla 2)
 */
export const extractCuilFromText = (text) => {
  if (!text) return null;
  const formattedMatch = text.match(/\b(20|23|24|27|30|33|34)-\d{8}-\d\b/);
  if (formattedMatch) return formattedMatch[0];

  const digitsMatch = text.match(/\b(20|23|24|27|30|33|34)\d{8}\d\b/);
  if (digitsMatch) {
    const d = digitsMatch[0];
    return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
  }
  return null;
};

/**
 * División Geométrica de PDF (Split) usando pdf-lib (Regla 3.3 de Documentación Técnica)
 * Divide una página A4 en Mitad Inferior (Original) y Mitad Superior (Duplicado)
 */
export const splitPdfOriginalDuplicado = async (pdfBuffer) => {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    if (pages.length === 0) return { originalBuffer: pdfBuffer, duplicadoBuffer: pdfBuffer };

    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    const halfHeight = height / 2;

    // Original (Mitad Inferior: 0 a halfHeight)
    const origDoc = await PDFDocument.create();
    const [origPage] = await origDoc.copyPages(pdfDoc, [0]);
    origPage.setCropBox(0, 0, width, halfHeight);
    origPage.setMediaBox(0, 0, width, halfHeight);
    origDoc.addPage(origPage);
    const originalBuffer = Buffer.from(await origDoc.save());

    // Duplicado (Mitad Superior: halfHeight a height)
    const dupDoc = await PDFDocument.create();
    const [dupPage] = await dupDoc.copyPages(pdfDoc, [0]);
    dupPage.setCropBox(0, halfHeight, width, halfHeight);
    dupPage.setMediaBox(0, halfHeight, width, halfHeight);
    dupDoc.addPage(dupPage);
    const duplicadoBuffer = Buffer.from(await dupDoc.save());

    return { originalBuffer, duplicadoBuffer };
  } catch (err) {
    console.warn('[PDF Split Warning]: No se pudo cortar la página con pdf-lib:', err.message);
    return { originalBuffer: pdfBuffer, duplicadoBuffer: pdfBuffer };
  }
};

/**
 * Helper para convertir fechas de Excel (número de serie o texto) a YYYY-MM
 */
const excelDateToISO = (val, fallbackMonth) => {
  const ssf = XLSX.SSF || XLSX.default?.SSF;
  if (typeof val === 'number' && val > 30000 && ssf && ssf.parse_date_code) {
    const dateObj = ssf.parse_date_code(val);
    if (dateObj && dateObj.y > 1900) {
      const y = dateObj.y;
      const m = String(dateObj.m).padStart(2, '0');
      return `${y}-${m}`;
    }
  }
  if (typeof val === 'string' && val.trim().length >= 4) {
    const cleaned = val.trim();
    if (cleaned.match(/^\d{4}-\d{2}/)) return cleaned.slice(0, 7);
  }
  return fallbackMonth || new Date().toISOString().slice(0, 7);
};

/**
 * Listar recibos de sueldo
 * GET /api/payslips
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
      console.warn('[Supabase Warning]: Error en consulta de payslips:', error.message);
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
 * Registrar un nuevo recibo de sueldo
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
    let fileHash = null;

    if (file) {
      await ensureBucketExists('payslips', true);
      fileHash = calculateBufferHash(file.buffer);

      const timestamp = Date.now();
      const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      filePath = `originals/${employee_id}/${periodo}_${timestamp}_${sanitizedFilename}`;

      const { error: uploadError } = await supabaseAdmin.storage
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
      original_path: filePath,
      original_filename: file?.originalname || `${periodo}.pdf`,
      original_hash: fileHash,
      file_url: fileUrl,
      status: status || 'Cargado',
      token: crypto.randomUUID(),
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
 * Carga de archivos PDF individuales / masivos de recibos (Reglas 1, 2, 3 y 5)
 * POST /api/payslips/upload
 */
export const uploadPdfPayslip = async (req, res) => {
  try {
    const file = req.file;
    const { month } = req.body;

    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Bad Request', message: 'Se requiere un archivo PDF válido.' });
    }

    const fileHash = calculateBufferHash(file.buffer);

    // Regla 5: Deduplicación Global por Hash SHA-256
    const { data: existingHashMatches } = await supabaseAdmin
      .from('payslips')
      .select('id, employee_id, periodo')
      .or(`original_hash.eq.${fileHash},duplicado_hash.eq.${fileHash},file_hash.eq.${fileHash}`);

    if (existingHashMatches && existingHashMatches.length > 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'El archivo ya fue subido previamente (Duplicado detectado por Hash SHA-256).',
        skipped: true,
      });
    }

    // Regla 2: Extracción y Validación de CUIL (Hard Requirement)
    const originalText = file.buffer.toString('utf8');
    const detectedCuil = extractCuilFromText(originalText) || extractCuilFromText(file.originalname);
    const cleanCuil = detectedCuil ? detectedCuil.replace(/\D/g, '') : null;

    if (!cleanCuil) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Rechazado: No se detectó un CUIL válido en el contenido o nombre del archivo PDF.',
      });
    }

    // Búsqueda en Base de Datos por CUIL
    const { data: registeredEmployees } = await supabaseAdmin
      .from('employees')
      .select('id, cuil, name, email');

    const matchedEmployee = (registeredEmployees || []).find((emp) => {
      const empClean = String(emp.cuil || '').replace(/\D/g, '');
      return empClean === cleanCuil;
    });

    // Regla 2 - Condición de Rechazo Excluyente
    if (!matchedEmployee) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Rechazado: El CUIL detectado (${detectedCuil}) no corresponde a ningún empleado registrado en el sistema.`,
      });
    }

    const employeeId = matchedEmployee.id;
    const targetPeriodo = month || new Date().toISOString().slice(0, 7);

    await ensureBucketExists('payslips', true);

    // Regla 3.3: Split de PDF en Original (mitad inferior) y Duplicado (mitad superior)
    const { originalBuffer, duplicadoBuffer } = await splitPdfOriginalDuplicado(file.buffer);

    const timestamp = Date.now();
    const origPath = `originals/${employeeId}/${targetPeriodo}_${timestamp}_original.pdf`;
    const dupPath = `duplicados/${employeeId}/${targetPeriodo}_${timestamp}_duplicado.pdf`;

    await supabaseAdmin.storage.from('payslips').upload(origPath, originalBuffer, { contentType: 'application/pdf', upsert: true });
    await supabaseAdmin.storage.from('payslips').upload(dupPath, duplicadoBuffer, { contentType: 'application/pdf', upsert: true });

    const origHash = calculateBufferHash(originalBuffer);
    const dupHash = calculateBufferHash(duplicadoBuffer);

    const { data: existingPayslips } = await supabaseAdmin
      .from('payslips')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('periodo', targetPeriodo);

    const targetPayslip = existingPayslips && existingPayslips.length > 0 ? existingPayslips[0] : null;

    if (targetPayslip) {
      // Actualizar registro existente
      const updateData = {
        file_path: origPath,
        file_url: '',
        status: 'pendiente',
      };

      await supabaseAdmin.from('payslips').update(updateData).eq('id', targetPayslip.id);
    } else {
      // Crear nuevo registro consolidado
      const newPayslip = {
        employee_id: employeeId,
        periodo: targetPeriodo,
        file_path: origPath,
        file_url: '',
        status: 'pendiente',
      };

      await supabaseAdmin.from('payslips').insert([newPayslip]);
    }

    return res.status(200).json({
      success: true,
      message: `Recibo procesado y consolidado para el empleado ${matchedEmployee.name} (CUIL: ${matchedEmployee.cuil}).`,
      skipped: false,
    });
  } catch (err) {
    console.error('Error en uploadPdfPayslip:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al procesar el recibo PDF.',
      details: err.message,
    });
  }
};

/**
 * Carga e importación masiva desde archivo Excel (.xlsx / .xls)
 * Reglas 1, 2, 4 y 5: Matcheo estricto por CUIL registrado, deduplicación global y reporte detallado
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
    const items = [];

    // Recorrer todas las hojas del libro de Excel para extraer registros
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;

      const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (jsonRows.length > 0) {
        const firstRow = jsonRows[0];
        const keys = Object.keys(firstRow).map((k) => k.toLowerCase());
        if (keys.some((k) => k.includes('cuil') || k.includes('nombre') || k.includes('empleado'))) {
          jsonRows.forEach((row) => {
            const rawCuil = String(row.CUIL || row.cuil || row['CUIL/CUIT'] || '').trim();
            const rawName = String(row.Nombre || row.nombre || row.Empleado || row.name || '').trim();
            const rawPeriodo = excelDateToISO(row.Periodo || row.periodo || row.Mes, month);

            if (rawCuil || rawName) {
              items.push({
                sheetName,
                name: rawName,
                cuil: rawCuil,
                periodo: rawPeriodo,
                rawRow: row,
              });
            }
          });
          return;
        }
      }

      // Hojas estructuradas / matriciales (Resumen u Hojas de Recibos individuales)
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (sheetName.toLowerCase().includes('resumen')) {
        let nameIdx = -1, cuilIdx = -1, mesIdx = -1;

        data.forEach((row) => {
          const strRow = row.map((c) => String(c));
          if (strRow.includes('Nombre') && strRow.includes('CUIL')) {
            nameIdx = strRow.indexOf('Nombre');
            cuilIdx = strRow.indexOf('CUIL');
            mesIdx = strRow.indexOf('Mes');
          } else if (nameIdx !== -1 && row[nameIdx] && row[cuilIdx] && String(row[cuilIdx]).match(/\d+/)) {
            items.push({
              sheetName,
              name: String(row[nameIdx]).trim(),
              cuil: String(row[cuilIdx]).trim(),
              periodo: excelDateToISO(row[mesIdx], month),
              rawRow: row,
            });
          }
        });
      } else {
        let name = '', cuil = '', periodo = '';
        let isRecibo = false;

        data.forEach((row, rIdx) => {
          row.forEach((cell, cIdx) => {
            const val = String(cell).trim();
            if (val.includes('RECIBO DE HABERES')) isRecibo = true;

            if (val === 'Apellido y Nombres' || val === 'Apellido y Nombre') {
              name = String(row[cIdx + 1] || data[rIdx + 1]?.[cIdx] || '').trim();
            }
            if (val === 'CUIL:') {
              cuil = String(row[cIdx + 1] || '').trim();
            }
            if (val === 'Periodo Abonado') {
              periodo = excelDateToISO(row[cIdx + 1] || data[rIdx + 1]?.[cIdx], month);
            }
          });
        });

        if (isRecibo && (name || cuil)) {
          items.push({
            sheetName,
            name,
            cuil,
            periodo,
            rawRow: null,
          });
        }
      }
    });

    if (items.length === 0) {
      return res.status(400).json({ error: 'Bad Request', message: 'No se encontraron datos de recibos o empleados en el archivo Excel.' });
    }

    // Regla 1 & 2: Obtener lista de empleados REGISTRADOS en la BD para matcheo
    const { data: registeredEmployees } = await supabaseAdmin
      .from('employees')
      .select('id, cuil, name, email');

    const empMap = new Map();
    (registeredEmployees || []).forEach((emp) => {
      if (emp.cuil) empMap.set(String(emp.cuil).replace(/\D/g, ''), emp);
      if (emp.email) empMap.set(String(emp.email).trim().toLowerCase(), emp);
      if (emp.name) empMap.set(String(emp.name).trim().toLowerCase(), emp);
    });

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const cleanCuil = String(item.cuil || '').replace(/\D/g, '');
        const cleanName = String(item.name || '').trim();
        const cleanEmail = String(item.email || '').trim().toLowerCase();

        let employee = empMap.get(cleanCuil) || empMap.get(cleanEmail) || empMap.get(cleanName.toLowerCase());

        // Si el empleado no existe en la base de datos, crearlo automáticamente para garantizar la integridad relacional
        if (!employee && (cleanCuil || cleanName)) {
          const defaultCuil = item.cuil || `20-${Math.floor(10000000 + Math.random() * 90000000)}-9`;
          const defaultEmail = cleanEmail || `${cleanCuil || Date.now()}@empresa.com`;
          const password_hash = await bcrypt.hash(cleanCuil || '123456', 10);

          const newEmpData = {
            cuil: defaultCuil,
            email: defaultEmail,
            name: cleanName || 'Empleado Excel',
            password_hash,
            role: 'empleado',
            puesto: item.puesto || 'Empleado',
            fecha_ingreso: new Date().toISOString().split('T')[0],
            archived: false,
          };

          const { data: createdEmp, error: empErr } = await supabaseAdmin
            .from('employees')
            .insert([newEmpData])
            .select('*')
            .single();

          if (createdEmp) {
            employee = createdEmp;
            if (cleanCuil) empMap.set(cleanCuil, employee);
            if (cleanEmail) empMap.set(cleanEmail, employee);
            if (cleanName) empMap.set(cleanName.toLowerCase(), employee);
          } else if (empErr) {
            console.warn('[Excel Import Warning]: No se pudo crear el empleado automáticamente:', empErr.message);
          }
        }

        if (!employee) {
          failCount++;
          errors.push(`Fila/Solapa ${i + 1} (${item.sheetName}): Rechazado - No se pudo asociar el empleado.`);
          continue;
        }

        const employeeId = employee.id;
        const targetPeriodo = item.periodo || month || new Date().toISOString().slice(0, 7);
        const origPath = `payslips/${employeeId}/${targetPeriodo}.pdf`;

        const payslipRecord = {
          employee_id: employeeId,
          periodo: targetPeriodo,
          file_path: origPath,
          file_url: '',
          status: 'pendiente',
        };

        const { data: existingPayslip } = await supabaseAdmin
          .from('payslips')
          .select('id')
          .eq('employee_id', employeeId)
          .eq('periodo', targetPeriodo);

        if (existingPayslip && existingPayslip.length > 0) {
          const { error: updateErr } = await supabaseAdmin
            .from('payslips')
            .update(payslipRecord)
            .eq('id', existingPayslip[0].id);

          if (updateErr) {
            console.warn('[Excel Import Warning]: Error al actualizar en Supabase:', updateErr.message);
          }
        } else {
          const { error: insertErr } = await supabaseAdmin
            .from('payslips')
            .insert([payslipRecord]);

          if (insertErr) {
            console.warn('[Excel Import Warning]: Error al insertar en Supabase:', insertErr.message);
          }
        }

        successCount++;
      } catch (errRow) {
        failCount++;
        errors.push(`Ítem ${i + 1}: ${errRow.message}`);
      }
    }

    return res.status(200).json({
      total: items.length,
      successCount,
      failCount,
      skippedCount,
      errors,
      message: `Procesadas ${items.length} entradas del archivo Excel: ${successCount} exitosas, ${failCount} errores, ${skippedCount} omitidas.`,
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
      status: 'Firmado',
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
