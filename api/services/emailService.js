const nodemailer = require('nodemailer');
require('dotenv').config();

// Leer variables de entorno estrictas
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'no-reply@e-abc.com';
const COMPANY_NAME = process.env.COMPANY_NAME || 'e-ABC Learning';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Determinar si hay configuración de servidor SMTP real
const isSmtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;

if (isSmtpConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true para 465, false para otros puertos
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

/**
 * Obtener la dirección de remitente formateada
 */
function getFromAddress() {
  if (COMPANY_NAME) {
    return `"${COMPANY_NAME}" <${SMTP_FROM}>`;
  }
  return SMTP_FROM;
}

/**
 * Envía un correo electrónico usando Nodemailer o simulación por consola si no hay credenciales SMTP.
 * @param {Object} options
 * @param {string} options.to - Destinatario
 * @param {string} options.subject - Asunto del correo
 * @param {string} [options.html] - Contenido HTML
 * @param {string} [options.text] - Contenido texto plano
 * @returns {Promise<Object>} Resultado del envío
 */
async function sendEmail({ to, subject, html, text }) {
  const from = getFromAddress();

  if (!isSmtpConfigured || !transporter) {
    console.log('---------------------------------------------------------');
    console.log('[EMAIL SERVICE - SIMULACIÓN LOCAL POR CONSOLA]');
    console.log(`De: ${from}`);
    console.log(`Para: ${to}`);
    console.log(`Asunto: ${subject}`);
    console.log(`Texto: ${text || 'Sin versión en texto plano'}`);
    console.log(`HTML: ${html || 'Sin versión HTML'}`);
    console.log('---------------------------------------------------------');

    return {
      success: true,
      simulated: true,
      messageId: `simulated-${Date.now()}`
    };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html
    });

    console.log(`[EMAIL SERVICE] Correo enviado exitosamente a ${to}. MessageId: ${info.messageId}`);
    return {
      success: true,
      simulated: false,
      messageId: info.messageId
    };
  } catch (err) {
    console.error(`[EMAIL SERVICE ERROR] Falló envío a ${to}:`, err.message);
    throw err;
  }
}

/**
 * Helper para enviar correo de notificación de firma de recibo con enlace directo.
 * @param {Object} options
 * @param {string} options.to - Email del empleado
 * @param {string} options.employeeName - Nombre del empleado
 * @param {string} options.month - Mes del recibo (ej: 2026-08)
 * @param {string} options.token - Token único del recibo
 * @returns {Promise<Object>}
 */
async function sendPayslipSignatureNotification({ to, employeeName, month, token }) {
  const baseUrl = process.env.BASE_URL || BASE_URL;
  const signUrl = `${baseUrl}/api/sign/${token}`;
  const subject = `[${COMPANY_NAME}] Recibo de Sueldo disponible para firma - ${month}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">Hola, ${employeeName}</h2>
      <p>Tu recibo de sueldo correspondiente al período <strong>${month}</strong> ya se encuentra disponible para su firma digital en la plataforma de <strong>${COMPANY_NAME}</strong>.</p>
      <div style="margin: 30px 0; text-align: center;">
        <a href="${signUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Revisar y Firmar Recibo
        </a>
      </div>
      <p style="font-size: 13px; color: #6b7280;">Si el botón no funciona, puedes copiar y pegar el siguiente enlace en tu navegador:<br/>
      <a href="${signUrl}" style="color: #4f46e5;">${signUrl}</a></p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;"/>
      <p style="font-size: 12px; color: #9ca3af; text-align: center;">Este es un mensaje automático generado por ${COMPANY_NAME}. Por favor no responda a este correo.</p>
    </div>
  `;

  const text = `Hola ${employeeName},\n\nTu recibo de sueldo de ${month} está listo para su firma digital.\nAccede al enlace para firmarlo: ${signUrl}\n\n${COMPANY_NAME}`;

  return sendEmail({ to, subject, html, text });
}

/**
 * Obtener estado actual de la configuración del servicio de correo.
 */
function getEmailServiceStatus() {
  return {
    isConfigured: isSmtpConfigured,
    smtpHost: SMTP_HOST || null,
    smtpPort: SMTP_PORT,
    fromAddress: getFromAddress(),
    companyName: COMPANY_NAME,
    baseUrl: process.env.BASE_URL || BASE_URL
  };
}

module.exports = {
  sendEmail,
  sendPayslipSignatureNotification,
  getEmailServiceStatus,
  getFromAddress
};
