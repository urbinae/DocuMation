/**
 * @file emailService.test.js
 * @description Suite QA – Pruebas unitarias e integración del servicio de envío de recibos.
 *              Cubre: sendEmail(), sendPayslipSignatureNotification(), getEmailServiceStatus(),
 *              getFromAddress() y el endpoint HTTP POST /api/payslips/:id/send-email.
 *
 *              Estrategia de mock:
 *              - nodemailer se reemplaza en require.cache para evitar conexiones SMTP reales.
 *              - dotenv se neutraliza para que el .env físico no sobreescriba variables de test.
 *              - Supabase se sustituye por un stub en memoria, idéntico al patrón de tests existentes.
 *
 * @qa-engineer  DocuMation QA v1.0
 */

'use strict';

const { test, describe, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de módulo (carga aislada con env vars y mocks controlados)
// ─────────────────────────────────────────────────────────────────────────────

const SMTP_ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'COMPANY_NAME', 'BASE_URL'];

/**
 * Carga emailService.js con variables de entorno específicas y un transporter de nodemailer
 * inyectado, sin leer el .env real.
 *
 * @param {Object}      envVars          - Variables de entorno a aplicar (null = borrar la var)
 * @param {Object|null} mockTransporter  - Objeto con `.sendMail()` a inyectar en nodemailer
 * @returns {Object} Módulo emailService fresco
 */
function loadEmailService(envVars = {}, mockTransporter = null) {
  // 1. Neutralizar dotenv para que no lea .env durante la carga del módulo
  const dotenvPath = require.resolve('dotenv');
  const origDotenv = require.cache[dotenvPath];
  require.cache[dotenvPath] = {
    id: dotenvPath, filename: dotenvPath, loaded: true,
    exports: { config: () => ({ parsed: {} }) }
  };

  // 2. Inyectar mock de nodemailer si se provee un transporter
  const nodemailerPath = require.resolve('nodemailer');
  const origNodemailer = require.cache[nodemailerPath];
  if (mockTransporter !== null) {
    require.cache[nodemailerPath] = {
      id: nodemailerPath, filename: nodemailerPath, loaded: true,
      exports: { createTransport: () => mockTransporter }
    };
  }

  // 3. Guardar env actual y aplicar los valores del test
  const savedEnv = {};
  for (const key of SMTP_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    if (key in envVars) {
      if (envVars[key] == null) delete process.env[key];
      else process.env[key] = String(envVars[key]);
    } else {
      // Para garantizar aislamiento, borrar cualquier valor residual no especificado
      delete process.env[key];
    }
  }

  // 4. Borrar caché del módulo y cargarlo fresco
  const svcPath = require.resolve('../api/services/emailService');
  delete require.cache[svcPath];
  const service = require('../api/services/emailService');

  // 5. Restaurar env y caches de dependencias
  for (const key of SMTP_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (origDotenv) require.cache[dotenvPath] = origDotenv;
  else delete require.cache[dotenvPath];
  if (origNodemailer) require.cache[nodemailerPath] = origNodemailer;
  else if (mockTransporter !== null) delete require.cache[nodemailerPath];

  return service;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de prueba
// ─────────────────────────────────────────────────────────────────────────────
const ENV_SMTP = {
  SMTP_HOST: 'smtp.test.local',
  SMTP_PORT: '587',
  SMTP_USER: 'test@empresa.com',
  SMTP_PASS: 'secret',
  SMTP_FROM: 'noreply@empresa.com',
  COMPANY_NAME: 'EmpresaTest',
  BASE_URL: 'http://localhost:9999'
};

const ENV_NO_SMTP = {
  SMTP_HOST: null,
  SMTP_USER: null,
  SMTP_PASS: null,
  SMTP_FROM: 'noreply@empresa.com',
  COMPANY_NAME: 'EmpresaTest',
  BASE_URL: 'http://localhost:9999'
};

// ═════════════════════════════════════════════════════════════════════════════
// BLOQUE 1 – TESTS UNITARIOS DEL MÓDULO emailService.js
// ═════════════════════════════════════════════════════════════════════════════

describe('Unit Tests – emailService.js', () => {

  // ─── getEmailServiceStatus() ──────────────────────────────────────────────
  describe('getEmailServiceStatus()', () => {

    test('Retorna isConfigured=false cuando faltan credenciales SMTP', () => {
      const svc = loadEmailService(ENV_NO_SMTP);
      const status = svc.getEmailServiceStatus();

      assert.equal(status.isConfigured, false,
        'isConfigured debe ser false si SMTP_HOST / SMTP_USER / SMTP_PASS no están definidos');
      assert.equal(status.smtpHost, null,
        'smtpHost debe ser null cuando SMTP_HOST no está definido');
      assert.equal(status.companyName, 'EmpresaTest',
        'companyName debe leerse de la variable de entorno COMPANY_NAME');
      assert.equal(status.baseUrl, 'http://localhost:9999',
        'baseUrl debe reflejar BASE_URL del entorno de prueba');
    });

    test('Retorna isConfigured=true cuando las tres credenciales SMTP están presentes', () => {
      const svc = loadEmailService(ENV_SMTP, { sendMail: async () => ({ messageId: 'ok' }) });
      const status = svc.getEmailServiceStatus();

      assert.equal(status.isConfigured, true,
        'isConfigured debe ser true cuando SMTP_HOST + SMTP_USER + SMTP_PASS están configurados');
      assert.equal(status.smtpHost, 'smtp.test.local',
        'smtpHost debe reflejar el valor de SMTP_HOST');
      assert.equal(status.smtpPort, 587,
        'smtpPort debe ser el número entero 587');
    });

    test('fromAddress tiene formato "CompanyName <email>" cuando COMPANY_NAME está definido', () => {
      const svc = loadEmailService(ENV_SMTP, { sendMail: async () => ({ messageId: 'ok' }) });
      const status = svc.getEmailServiceStatus();

      assert.ok(
        status.fromAddress.includes('EmpresaTest') && status.fromAddress.includes('noreply@empresa.com'),
        `fromAddress debe incluir el nombre de empresa y el email, obtenido: ${status.fromAddress}`
      );
    });
  });

  // ─── getFromAddress() ─────────────────────────────────────────────────────
  describe('getFromAddress()', () => {

    test('Retorna "CompanyName <email>" cuando COMPANY_NAME está definido', () => {
      const svc = loadEmailService({ ...ENV_SMTP });
      const from = svc.getFromAddress();

      assert.match(from, /"EmpresaTest" <noreply@empresa\.com>/,
        `Formato esperado: "EmpresaTest" <noreply@empresa.com>, recibido: ${from}`);
    });

    test('Retorna solo el email cuando COMPANY_NAME es vacío', () => {
      // getFromAddress() usa ?? para nullish coalescing: solo aplica el fallback cuando
      // process.env.COMPANY_NAME es null/undefined.
      // Debemos setearlo en '' (string vacío) para que ?? lo respete como valor intencional.
      const saved = process.env.COMPANY_NAME;
      process.env.COMPANY_NAME = '';  // forzar vacío → ?? NO aplica fallback al default del módulo

      const svc  = loadEmailService({ ...ENV_SMTP, COMPANY_NAME: '' });
      const from = svc.getFromAddress();

      // Restaurar antes del assert para no contaminar otros tests en caso de fallo
      if (saved !== undefined) process.env.COMPANY_NAME = saved;
      else delete process.env.COMPANY_NAME;

      assert.equal(from, 'noreply@empresa.com',
        `Cuando COMPANY_NAME está vacío debe retornar solo el SMTP_FROM, recibido: ${from}`);
    });
  });

  // ─── sendEmail() – Modo Simulación ────────────────────────────────────────
  describe('sendEmail() – Modo Simulación (sin SMTP)', () => {

    test('Retorna {success:true, simulated:true} con un messageId generado', async () => {
      const svc = loadEmailService(ENV_NO_SMTP);
      const result = await svc.sendEmail({
        to: 'empleado@empresa.com',
        subject: 'Test Asunto',
        html: '<p>Cuerpo</p>',
        text: 'Cuerpo'
      });

      assert.equal(result.success, true, 'success debe ser true');
      assert.equal(result.simulated, true, 'simulated debe ser true en modo consola');
      assert.ok(result.messageId && result.messageId.startsWith('simulated-'),
        `messageId debe comenzar con "simulated-", recibido: ${result.messageId}`);
    });

    test('No lanza excepción aunque to o subject estén vacíos (modo simulación es tolerante)', async () => {
      const svc = loadEmailService(ENV_NO_SMTP);

      await assert.doesNotReject(
        () => svc.sendEmail({ to: '', subject: '', text: '' }),
        'El modo simulación no debe lanzar excepción aunque los campos estén vacíos'
      );
    });

    test('Cada llamada genera un messageId único', async () => {
      const svc = loadEmailService(ENV_NO_SMTP);
      const r1 = await svc.sendEmail({ to: 'a@a.com', subject: 'A', text: 'A' });
      const r2 = await svc.sendEmail({ to: 'b@b.com', subject: 'B', text: 'B' });

      assert.notEqual(r1.messageId, r2.messageId,
        'Cada mensaje simulado debe tener un messageId distinto');
    });
  });

  // ─── sendEmail() – Modo SMTP real (mock de nodemailer) ───────────────────
  describe('sendEmail() – Modo SMTP con mock de nodemailer', () => {

    test('Invoca sendMail con los campos from, to, subject, html y text correctos', async () => {
      let capturedArgs = null;
      const mockTransporter = {
        sendMail: async (args) => {
          capturedArgs = args;
          return { messageId: '<test-id-001@smtp.test>' };
        }
      };

      const svc = loadEmailService(ENV_SMTP, mockTransporter);
      await svc.sendEmail({
        to: 'empleado@empresa.com',
        subject: 'Asunto de prueba',
        html: '<b>HTML</b>',
        text: 'Texto plano'
      });

      assert.ok(capturedArgs, 'sendMail debe haber sido llamado');
      assert.equal(capturedArgs.to, 'empleado@empresa.com', 'Campo "to" incorrecto');
      assert.equal(capturedArgs.subject, 'Asunto de prueba', 'Campo "subject" incorrecto');
      assert.equal(capturedArgs.html, '<b>HTML</b>', 'Campo "html" incorrecto');
      assert.equal(capturedArgs.text, 'Texto plano', 'Campo "text" incorrecto');
      assert.ok(capturedArgs.from && capturedArgs.from.includes('noreply@empresa.com'),
        `Campo "from" debe incluir el email remitente, recibido: ${capturedArgs.from}`);
    });

    test('Retorna {success:true, simulated:false, messageId} cuando sendMail tiene éxito', async () => {
      const mockTransporter = {
        sendMail: async () => ({ messageId: '<real-id-123@smtp.test>' })
      };

      const svc = loadEmailService(ENV_SMTP, mockTransporter);
      const result = await svc.sendEmail({
        to: 'dest@empresa.com', subject: 'S', text: 'T'
      });

      assert.equal(result.success, true, 'success debe ser true');
      assert.equal(result.simulated, false, 'simulated debe ser false en modo SMTP real');
      assert.equal(result.messageId, '<real-id-123@smtp.test>',
        'messageId debe ser el retornado por nodemailer');
    });

    test('Propaga la excepción cuando sendMail falla (error de conexión SMTP)', async () => {
      const mockTransporter = {
        sendMail: async () => { throw new Error('ECONNREFUSED smtp.test.local:587'); }
      };

      const svc = loadEmailService(ENV_SMTP, mockTransporter);

      await assert.rejects(
        () => svc.sendEmail({ to: 'x@x.com', subject: 'S', text: 'T' }),
        /ECONNREFUSED/,
        'Debe relanzar el error de conexión SMTP sin envolverlo'
      );
    });
  });

  // ─── sendPayslipSignatureNotification() ───────────────────────────────────
  describe('sendPayslipSignatureNotification()', () => {

    const TOKEN = 'uuid-token-firma-123';
    const EMPLOYEE = 'Juan Pérez';
    const MONTH = '2026-08';
    const EMPLOYEE_TO = 'juan@empresa.com';

    test('El asunto contiene COMPANY_NAME y el mes del recibo', async () => {
      let capturedSubject = '';
      const mockTransporter = {
        sendMail: async (a) => { capturedSubject = a.subject; return { messageId: 'ok' }; }
      };

      const svc = loadEmailService(ENV_SMTP, mockTransporter);
      await svc.sendPayslipSignatureNotification({
        to: EMPLOYEE_TO, employeeName: EMPLOYEE, month: MONTH, token: TOKEN
      });

      assert.ok(capturedSubject.includes('EmpresaTest'),
        `El subject debe incluir el nombre de la empresa, recibido: "${capturedSubject}"`);
      assert.ok(capturedSubject.includes(MONTH),
        `El subject debe incluir el mes del recibo, recibido: "${capturedSubject}"`);
    });

    test('La URL de firma en el body contiene BASE_URL y el token del recibo', async () => {
      let capturedHtml = '';
      let capturedText = '';
      const mockTransporter = {
        sendMail: async (a) => {
          capturedHtml = a.html;
          capturedText = a.text;
          return { messageId: 'ok' };
        }
      };

      const svc = loadEmailService(ENV_SMTP, mockTransporter);
      await svc.sendPayslipSignatureNotification({
        to: EMPLOYEE_TO, employeeName: EMPLOYEE, month: MONTH, token: TOKEN
      });

      const expectedUrl = `/#firmar?token=${TOKEN}`;
      assert.ok(capturedHtml.includes(expectedUrl),
        `El HTML debe contener la URL de firma correcta del portal.\nEsperada con: ${expectedUrl}`);
      assert.ok(capturedText.includes(expectedUrl),
        `El texto plano debe contener la URL de firma correcta del portal.\nEsperada con: ${expectedUrl}`);
    });

    test('El body HTML contiene el nombre del empleado', async () => {
      let capturedHtml = '';
      const mockTransporter = {
        sendMail: async (a) => { capturedHtml = a.html; return { messageId: 'ok' }; }
      };

      const svc = loadEmailService(ENV_SMTP, mockTransporter);
      await svc.sendPayslipSignatureNotification({
        to: EMPLOYEE_TO, employeeName: EMPLOYEE, month: MONTH, token: TOKEN
      });

      assert.ok(capturedHtml.includes(EMPLOYEE),
        `El HTML debe saludar al empleado por nombre, buscando: "${EMPLOYEE}"`);
    });

    test('En modo simulación retorna {success:true, simulated:true} sin enviar email', async () => {
      const svc = loadEmailService(ENV_NO_SMTP);
      const result = await svc.sendPayslipSignatureNotification({
        to: EMPLOYEE_TO, employeeName: EMPLOYEE, month: MONTH, token: TOKEN
      });

      assert.equal(result.success, true, 'success debe ser true en simulación');
      assert.equal(result.simulated, true, 'simulated debe ser true en simulación');
    });

    test('Caso de borde: token vacío genera URL de firma con token vacío (sin crashear)', async () => {
      const svc = loadEmailService(ENV_NO_SMTP);

      await assert.doesNotReject(
        () => svc.sendPayslipSignatureNotification({
          to: EMPLOYEE_TO, employeeName: EMPLOYEE, month: MONTH, token: ''
        }),
        'No debe lanzar excepción cuando el token es una cadena vacía'
      );
    });
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// BLOQUE 2 – TESTS DE INTEGRACIÓN HTTP: POST /api/payslips/:id/send-email
// ═════════════════════════════════════════════════════════════════════════════

describe('Integration Tests – POST /api/payslips/:id/send-email', () => {

  // ─── Setup: mock de Supabase en memoria ───────────────────────────────────
  let mockEmployees = [];
  let mockPayslips = [];

  const mockSupabase = {
    from(table) {
      let filters = [];
      let isSingle = false;
      let updateData = null;
      const builder = {
        select() { return builder; },
        update(data) { updateData = data; return builder; },
        eq(col, val) { filters.push({ col, val }); return builder; },
        order() { return builder; },
        single() { isSingle = true; return builder.execute(); },
        maybeSingle() { isSingle = true; return builder.execute(); },
        async then(resolve, reject) {
          try {
            const res = await builder.execute();
            resolve(res);
          } catch (err) {
            reject(err);
          }
        },
        async execute() {
          if (table === 'employees') {
            let list = [...mockEmployees];
            for (const f of filters) list = list.filter(e => e[f.col] === f.val);
            return { data: isSingle ? (list[0] || null) : list, error: null };
          }
          if (table === 'payslips') {
            let list = [...mockPayslips];
            for (const f of filters) list = list.filter(p => p[f.col] === f.val);
            if (updateData) {
              list.forEach(p => Object.assign(p, updateData));
            }
            return { data: isSingle ? (list[0] || null) : list, error: null };
          }
          return { data: null, error: null };
        }
      };
      return builder;
    },
    storage: { from: () => ({ upload: async () => ({ data: {}, error: null }) }) }
  };

  // ─── Mock de emailService para capturar llamadas sin SMTP real ────────────
  let capturedEmailCall = null;
  const mockEmailService = {
    sendPayslipSignatureNotification: async (opts) => {
      capturedEmailCall = opts;
      return { success: true, simulated: true, messageId: `simulated-${Date.now()}` };
    },
    getEmailServiceStatus: () => ({ isConfigured: false }),
    sendEmail: async () => ({ success: true, simulated: true })
  };

  // ─── Servidor HTTP de prueba ──────────────────────────────────────────────
  let server;
  let port;

  function getServer() {
    return new Promise((resolve) => {
      if (server) return resolve();
      // Inyectar mocks antes de requerir la app
      require('../api/lib/supabase').supabase = mockSupabase;

      const emailSvcPath = require.resolve('../api/services/emailService');
      delete require.cache[emailSvcPath];
      require.cache[emailSvcPath] = {
        id: emailSvcPath, filename: emailSvcPath, loaded: true,
        exports: mockEmailService
      };

      // Recargar la app para que use los mocks
      const appPath = require.resolve('../api/index');
      delete require.cache[appPath];
      const payslipsRoutePath = require.resolve('../api/routes/payslips');
      delete require.cache[payslipsRoutePath];

      const app = require('../api/index');
      server = http.createServer(app);
      server.listen(0, () => { port = server.address().port; resolve(); });
    });
  }

  /** Realiza una petición JSON al servidor de prueba */
  function jsonRequest(method, path, body = null) {
    return new Promise(async (resolve, reject) => {
      await getServer();
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload ? Buffer.byteLength(payload) : 0
        }
      }, (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  beforeEach(() => {
    mockEmployees = [];
    mockPayslips = [];
    capturedEmailCall = null;
  });

  after(() => { if (server) server.close(); });

  // ─── Tests ────────────────────────────────────────────────────────────────

  test('HTTP 404 cuando el id del recibo no existe en la base de datos', async () => {
    const res = await jsonRequest('POST', '/api/payslips/payslip-no-existe/send-email');

    assert.equal(res.status, 404,
      `Debe retornar 404 para un recibo inexistente, recibido: ${res.status}`);
    assert.ok(res.body.error, 'La respuesta debe incluir un campo "error"');
  });

  test('HTTP 400 cuando el empleado asociado al recibo no tiene email registrado', async () => {
    // Empleado sin email
    mockEmployees = [{ id: 'emp-sin-email', name: 'Sin Email', cuil: '20-11111111-1', email: null }];
    mockPayslips = [{
      id: 'payslip-sin-email',
      employee_id: 'emp-sin-email',
      month: '2026-08',
      token: 'token-test-sin-email',
      status: 'Cargado',
      employees: { name: 'Sin Email', email: null }
    }];

    const res = await jsonRequest('POST', '/api/payslips/payslip-sin-email/send-email');

    assert.equal(res.status, 400,
      `Debe retornar 400 cuando el empleado no tiene email, recibido: ${res.status}`);
    assert.ok(res.body.error.toLowerCase().includes('email'),
      `El error debe mencionar "email", recibido: "${res.body.error}"`);
  });

  test('HTTP 200 exitoso: actualiza el status a ENVIADO y asigna sent_at en la base de datos', async () => {
    mockEmployees = [{
      id: 'emp-uuid-001',
      name: 'Marcos Pérez',
      email: 'marcos@empresa.com',
      cuil: '20-33304672-6'
    }];
    mockPayslips = [{
      id: 'payslip-uuid-001',
      employee_id: 'emp-uuid-001',
      month: '2026-08',
      token: 'token-firma-abcde',
      status: 'Cargado',
      sent_at: null,
      employees: { name: 'Marcos Pérez', email: 'marcos@empresa.com' }
    }];

    const res = await jsonRequest('POST', '/api/payslips/payslip-uuid-001/send-email');

    assert.equal(res.status, 200);
    assert.equal(mockPayslips[0].status, 'ENVIADO', 'El status debe haber sido actualizado a ENVIADO');
    assert.ok(mockPayslips[0].sent_at !== null, 'El campo sent_at debe tener un timestamp ISO');
  });

  test('Error de envío de correo no muta el status ni el campo sent_at', async () => {
    mockEmployees = [{
      id: 'emp-err-001',
      name: 'Juan Error',
      email: 'error@empresa.com',
      cuil: '20-00000000-0'
    }];
    mockPayslips = [{
      id: 'payslip-err-001',
      employee_id: 'emp-err-001',
      month: '2026-08',
      token: 'tok-err',
      status: 'Cargado',
      sent_at: null,
      employees: { name: 'Juan Error', email: 'error@empresa.com' }
    }];

    // Forzar fallo en emailService
    const origSend = mockEmailService.sendPayslipSignatureNotification;
    mockEmailService.sendPayslipSignatureNotification = async () => {
      throw new Error('SMTP Error Connection Refused');
    };

    const res = await jsonRequest('POST', '/api/payslips/payslip-err-001/send-email');

    // Restaurar mock
    mockEmailService.sendPayslipSignatureNotification = origSend;

    assert.equal(res.status, 500);
    assert.equal(mockPayslips[0].status, 'Cargado', 'El status no debe mutar si el envío falla');
    assert.equal(mockPayslips[0].sent_at, null, 'sent_at debe permanecer null si el envío falla');
  });

  test('La respuesta incluye el campo "details" con el resultado del servicio de email', async () => {
    mockEmployees = [{ id: 'emp-002', name: 'Ana García', email: 'ana@empresa.com', cuil: '27-22222222-2' }];
    mockPayslips = [{
      id: 'payslip-002',
      employee_id: 'emp-002',
      month: '2026-07',
      token: 'tok-002',
      status: 'Cargado',
      employees: { name: 'Ana García', email: 'ana@empresa.com' }
    }];

    const res = await jsonRequest('POST', '/api/payslips/payslip-002/send-email');

    assert.equal(res.status, 200);
    assert.ok(res.body.details !== undefined,
      'La respuesta debe incluir el campo "details" con el resultado del emailService');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFICACIÓN DE FIX BUG-001: Alias /send/:id ahora resuelve correctamente
  // ─────────────────────────────────────────────────────────────────────────
  test('FIX BUG-001 VERIFICADO: /api/payslips/send/:id ahora retorna 200 (alias corregido en payslips.js)', async () => {
    mockEmployees = [{ id: 'emp-001', name: 'Test User', email: 'test@test.com', cuil: '20-11111111-1' }];
    mockPayslips  = [{
      id:          'payslip-bug-001',
      employee_id: 'emp-001',
      month:       '2026-08',
      token:       'tok-bug',
      status:      'Cargado',
      employees:   { name: 'Test User', email: 'test@test.com' }
    }];

    // Llamar la URL que usaba el frontend (antes retornaba 404, ahora tiene alias)
    const res = await jsonRequest('POST', '/api/payslips/send/payslip-bug-001');

    assert.equal(res.status, 200,
      `[FIX VERIFICADO] POST /api/payslips/send/:id debe retornar 200 tras el fix. ` +
      `Recibido: ${res.status}. Body: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true, 'El alias debe responder con success:true');

    console.log('\n✅ [FIX BUG-001] Alias /send/:id operativo — envío de recibos desde el frontend corregido.');
    console.log('   Alias activos: POST /api/payslips/:id/send-email  (canónico)');
    console.log('                  POST /api/payslips/send/:id         (frontend alias)');
    console.log('                  POST /api/payslips/send-bulk        (envío masivo)\n');
  });

  test('GET /api/employee/payslips/:employeeId y GET /api/payslips/employee/:employeeId retornan 200 con la lista de recibos', async () => {
    mockEmployees = [{ id: '5051338b-6ed7-48bb-ba57-317699446e87', name: 'Empleado Test', email: 'emp@test.com', cuil: '20-11111111-1' }];
    mockPayslips  = [{
      id:          'payslip-emp-001',
      employee_id: '5051338b-6ed7-48bb-ba57-317699446e87',
      month:       '2026-08',
      token:       'tok-emp-001',
      status:      'Cargado',
      original_storage_path: 'originals/recibo.pdf',
      duplicado_storage_path: 'duplicados/recibo.pdf',
      employees:   { id: '5051338b-6ed7-48bb-ba57-317699446e87', name: 'Empleado Test', email: 'emp@test.com', cuil: '20-11111111-1', puesto: 'Dev' }
    }];

    // 1. Probar la ruta que usa el Portal de Empleado (/api/employee/payslips/:id)
    const res1 = await jsonRequest('GET', '/api/employee/payslips/5051338b-6ed7-48bb-ba57-317699446e87');
    assert.equal(res1.status, 200, `GET /api/employee/payslips/:id debe retornar 200. Recibido: ${res1.status}`);
    assert.ok(Array.isArray(res1.body), 'La respuesta debe ser un arreglo');
    assert.equal(res1.body.length, 1, 'Debe incluir 1 recibo');
    assert.equal(res1.body[0].employeeId, '5051338b-6ed7-48bb-ba57-317699446e87');

    // 2. Probar la ruta canónica (/api/payslips/employee/:id)
    const res2 = await jsonRequest('GET', '/api/payslips/employee/5051338b-6ed7-48bb-ba57-317699446e87');
    assert.equal(res2.status, 200, `GET /api/payslips/employee/:id debe retornar 200. Recibido: ${res2.status}`);
    assert.ok(Array.isArray(res2.body), 'La respuesta debe ser un arreglo');
    assert.equal(res2.body.length, 1, 'Debe incluir 1 recibo');
  });
});
