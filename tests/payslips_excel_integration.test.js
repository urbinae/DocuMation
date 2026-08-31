const { test, describe, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Contenedores en memoria para simular Supabase PostgreSQL y Supabase Storage
let mockEmployees = [];
let mockPayslips = [];
let mockStorage = new Map();

// Mock de Supabase Client
const mockSupabase = {
  from(table) {
    let filters = [];
    let orFilter = null;
    let isSingle = false;
    let isMaybeSingle = false;
    let isInsert = false;
    let isUpdate = false;
    let insertPayload = null;
    let updatePayload = null;

    const builder = {
      select(cols) {
        return builder;
      },
      order(col, opts) {
        return builder;
      },
      eq(col, val) {
        filters.push({ col, val });
        return builder;
      },
      or(str) {
        orFilter = str;
        return builder;
      },
      single() {
        isSingle = true;
        return builder.execute();
      },
      maybeSingle() {
        isMaybeSingle = true;
        return builder.execute();
      },
      insert(arr) {
        isInsert = true;
        insertPayload = arr;
        return builder;
      },
      update(obj) {
        isUpdate = true;
        updatePayload = obj;
        return builder;
      },
      async then(resolve, reject) {
        try {
          const res = await builder.execute();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      },
      async execute() {
        // Tablas
        if (table === 'employees') {
          let list = [...mockEmployees];
          if (orFilter) {
            const targets = (orFilter.match(/cuil\.eq\.([^,]+)/g) || [])
              .map(s => s.replace('cuil.eq.', '').trim());
            list = list.filter(e => {
              const cleanE = (e.cuil || '').replace(/\D/g, '');
              return targets.some(t => t === e.cuil || t === cleanE);
            });
          }
          for (const f of filters) {
            list = list.filter(e => e[f.col] === f.val);
          }
          if (isSingle || isMaybeSingle) {
            return { data: list[0] || null, error: null };
          }
          return { data: list, error: null };
        }

        if (table === 'payslips') {
          if (isInsert) {
            const item = insertPayload[0];
            const created = {
              id: 'payslip-' + Math.random().toString(36).substring(2, 9),
              ...item,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            mockPayslips.push(created);
            return { data: isSingle ? created : [created], error: null };
          }

          if (isUpdate) {
            let item = mockPayslips;
            for (const f of filters) {
              item = item.filter(p => p[f.col] === f.val);
            }
            if (item.length > 0) {
              Object.assign(item[0], updatePayload);
              return { data: isSingle ? item[0] : item, error: null };
            }
            return { data: null, error: null };
          }

          let list = [...mockPayslips];
          for (const f of filters) {
            list = list.filter(p => p[f.col] === f.val);
          }
          if (isSingle || isMaybeSingle) {
            return { data: list[0] || null, error: null };
          }
          return { data: list, error: null };
        }

        return { data: [], error: null };
      }
    };

    return builder;
  },
  storage: {
    from(bucketName) {
      return {
        async upload(storagePath, buffer, options) {
          const key = `${bucketName}/${storagePath}`;
          mockStorage.set(key, buffer);
          return { data: { path: storagePath }, error: null };
        },
        async download(storagePath) {
          const key = `${bucketName}/${storagePath}`;
          const buf = mockStorage.get(key);
          if (!buf) {
            return { data: null, error: new Error('Archivo no encontrado en Storage') };
          }
          return {
            data: {
              arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
            },
            error: null
          };
        }
      };
    }
  }
};

// Reemplazar la instancia de supabase antes de cargar la aplicación Express
require('../api/lib/supabase').supabase = mockSupabase;

const app = require('../api/index');

let server;
let port;

function startServer() {
  return new Promise((resolve) => {
    if (server) return resolve();
    server = http.createServer(app);
    server.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });
}

/**
  Helper para construir peticiones multipart/form-data y enviarlas por HTTP al servidor local
 */
function sendMultipartRequest(endpointPath, filename, fileBuffer, fields = {}) {
  return new Promise(async (resolve, reject) => {
    if (!port) await startServer();

    const boundary = '----WebKitFormBoundaryIntegrationTest' + Math.random().toString(36).substring(2);
    const parts = [];

    if (filename && fileBuffer) {
      let fHeader = `--${boundary}\r\n`;
      fHeader += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
      fHeader += `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
      parts.push(Buffer.from(fHeader, 'utf8'));
      parts.push(fileBuffer);
      parts.push(Buffer.from('\r\n', 'utf8'));
    }

    for (const [k, v] of Object.entries(fields)) {
      let fieldPart = `--${boundary}\r\n`;
      fieldPart += `Content-Disposition: form-data; name="${k}"\r\n\r\n`;
      fieldPart += `${v}\r\n`;
      parts.push(Buffer.from(fieldPart, 'utf8'));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    const body = Buffer.concat(parts);

    const req = http.request({
      hostname: 'localhost',
      port,
      path: endpointPath,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        try {
          const parsed = rawData ? JSON.parse(rawData) : null;
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: rawData });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('Prueba de Integración: Flujo Completo Ingesta Excel -> PDF -> Split -> Supabase', () => {

  beforeEach(() => {
    // Inicializar estado base de mock DB y Storage antes de cada test
    mockEmployees = [
      {
        id: 'emp-uuid-33304672',
        name: 'MARCOS',
        email: 'marcos@empresa.com',
        cuil: '20-33304672-6',
        puesto: 'Administrativo'
      }
    ];
    mockPayslips = [];
    mockStorage.clear();
  });

  after(() => {
    if (server) {
      server.close();
    }
  });

  test('Flujo Principal: Ingesta exitosa del Excel de prueba con conversión, split geométrico y persistencia', async () => {
    // 1. Cargar archivo de prueba real especificado
    const excelPathCandidate1 = path.join(__dirname, '../filestests/Recibos Sueldos -para prueba.xls');
    const excelPathCandidate2 = path.join(__dirname, '../filestests/Recibos Sueldos -para prueba.xls.xlsx');
    const targetFilePath = fs.existsSync(excelPathCandidate1) ? excelPathCandidate1 : excelPathCandidate2;

    assert.ok(fs.existsSync(targetFilePath), `El archivo de prueba debe existir en ${targetFilePath}`);
    const excelBuffer = fs.readFileSync(targetFilePath);

    // 2. Ejecutar petición POST /api/payslips/upload-excel
    const month = '2026-08';
    const res = await sendMultipartRequest('/api/payslips/upload-excel', 'Recibos Sueldos -para prueba.xls', excelBuffer, { month });

    // 3. Verificación de Código de Estado HTTP y Resumen
    assert.strictEqual(res.status, 200, 'Debe responder con código HTTP 200 OK');
    assert.strictEqual(res.body.success, true, 'El flag success debe ser true');
    assert.ok(res.body.summary, 'La respuesta debe incluir el resumen de procesamiento');
    assert.strictEqual(res.body.summary.totalSheets, 1, 'Debe haber detectado 1 hoja en el Excel');
    assert.strictEqual(res.body.summary.processedCount, 1, 'Debe haber procesado correctamente 1 hoja');
    assert.strictEqual(res.body.summary.skippedCount, 0, 'No debe haber hojas omitidas');
    assert.strictEqual(res.body.summary.errors.length, 0, 'No deben reportarse errores de procesamiento');

    // 4. Verificación de Persistencia en Supabase PostgreSQL (Tabla payslips)
    assert.strictEqual(mockPayslips.length, 1, 'Debe haber insertado exactamente 1 registro en la tabla payslips');
    const payslip = mockPayslips[0];

    assert.strictEqual(payslip.employee_id, 'emp-uuid-33304672', 'El recibo debe vincularse al empleado correspondiente por CUIL');
    assert.strictEqual(payslip.detected_cuil, '20333046726', 'Debe haber detectado el CUIL 20333046726');
    assert.strictEqual(payslip.month, month, 'El mes del recibo debe coincidir con el enviado');
    assert.strictEqual(payslip.status, 'Cargado', 'El estado inicial debe ser "Cargado"');
    assert.ok(payslip.token, 'Debe haber generado un token UUID único para la firma');

    // Verificación de Rutas de Almacenamiento y Hashes SHA-256
    assert.ok(payslip.original_storage_path.startsWith('originals/'), 'La ruta del Original debe estar en el bucket /originals');
    assert.ok(payslip.duplicado_storage_path.startsWith('duplicados/'), 'La ruta del Duplicado debe estar en el bucket /duplicados');
    assert.ok(payslip.original_hash && payslip.original_hash.length === 64, 'Debe generar un Hash SHA-256 válido para el Original');
    assert.ok(payslip.duplicado_hash && payslip.duplicado_hash.length === 64, 'Debe generar un Hash SHA-256 válido para el Duplicado');
    assert.notStrictEqual(payslip.original_hash, payslip.duplicado_hash, 'Los hashes del Original y Duplicado deben ser distintos tras el split geométrico');

    // 5. Verificación de Persistencia en Supabase Storage (Archivos PDF)
    const originalKey = `payslips/${payslip.original_storage_path}`;
    const duplicadoKey = `payslips/${payslip.duplicado_storage_path}`;

    assert.ok(mockStorage.has(originalKey), 'El archivo PDF Original debe haberse subido a Supabase Storage');
    assert.ok(mockStorage.has(duplicadoKey), 'El archivo PDF Duplicado debe haberse subido a Supabase Storage');

    const origBuffer = mockStorage.get(originalKey);
    const dupBuffer = mockStorage.get(duplicadoKey);

    // Validar cabecera mágica PDF (%PDF-)
    assert.strictEqual(origBuffer.subarray(0, 4).toString(), '%PDF', 'El archivo guardado como Original debe ser un PDF válido');
    assert.strictEqual(dupBuffer.subarray(0, 4).toString(), '%PDF', 'El archivo guardado como Duplicado debe ser un PDF válido');
  });

  test('Idempotencia: Re-subir el mismo archivo Excel omite registros previamente cargados', async () => {
    const targetFilePath = path.join(__dirname, '../filestests/Recibos Sueldos -para prueba.xls');
    const excelBuffer = fs.readFileSync(targetFilePath);
    const month = '2026-08';

    // Primera subida
    const res1 = await sendMultipartRequest('/api/payslips/upload-excel', 'Recibos Sueldos -para prueba.xls', excelBuffer, { month });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.summary.processedCount, 1);

    // Segunda subida para el mismo mes
    const res2 = await sendMultipartRequest('/api/payslips/upload-excel', 'Recibos Sueldos -para prueba.xls', excelBuffer, { month });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.summary.processedCount, 0, 'No debe procesar nuevamente recibos ya existentes');
    assert.strictEqual(res2.body.summary.skippedCount, 1, 'Debe incrementar la cuenta de hojas omitidas (skippedCount)');
    assert.strictEqual(mockPayslips.length, 1, 'No debe crear registros duplicados en la base de datos');
  });

  test('Caso de borde: Error 400 cuando la petición no incluye archivo', async () => {
    const res = await sendMultipartRequest('/api/payslips/upload-excel', null, null, { month: '2026-08' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('Debe adjuntar un archivo Excel'));
  });

  test('Caso de borde: Reporta error si el CUIL detectado no pertenece a ningún empleado registrado', async () => {
    // Vaciar lista de empleados registrados
    mockEmployees = [];

    const targetFilePath = path.join(__dirname, '../filestests/Recibos Sueldos -para prueba.xls');
    const excelBuffer = fs.readFileSync(targetFilePath);

    const res = await sendMultipartRequest('/api/payslips/upload-excel', 'Recibos Sueldos -para prueba.xls', excelBuffer, { month: '2026-08' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.summary.processedCount, 0);
    assert.strictEqual(res.body.summary.errors.length, 1);
    assert.ok(res.body.summary.errors[0].error.includes('no corresponde a ningún empleado'));
    assert.strictEqual(mockPayslips.length, 0, 'No debe guardar ningún recibo en la base de datos');
  });
});
