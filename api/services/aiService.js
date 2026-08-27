const Groq = require('groq-sdk');
require('dotenv').config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

let groqClient = null;
let isGroqConfigured = false;

if (GROQ_API_KEY && GROQ_API_KEY.trim() !== '' && GROQ_API_KEY !== 'gsk_...') {
  try {
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
    isGroqConfigured = true;
    console.log('[AI SERVICE] Cliente de Groq IA inicializado correctamente con GROQ_API_KEY.');
  } catch (err) {
    console.error('[AI SERVICE ERROR] Error al inicializar cliente Groq:', err.message);
  }
} else {
  console.warn('[AI SERVICE] GROQ_API_KEY no configurada o usa placeholder. Modo simulación activo.');
}

/**
 * Genera una respuesta utilizando la API de Groq o un fallback simulado si no está configurada la API KEY.
 * @param {Object} options
 * @param {string} options.prompt - Mensaje del usuario o instrucción
 * @param {string} [options.systemPrompt] - Prompt del sistema
 * @param {string} [options.model] - Modelo Groq a utilizar
 * @param {number} [options.temperature] - Temperatura
 * @param {number} [options.maxTokens] - Límite de tokens
 * @returns {Promise<Object>} Respuesta estructurada
 */
async function generateCompletion({
  prompt,
  systemPrompt = 'Eres un asistente inteligente especializado en gestión de recibos de sueldo y liquidación de haberes.',
  model = DEFAULT_MODEL,
  temperature = 0.7,
  maxTokens = 1024
}) {
  if (!isGroqConfigured || !groqClient) {
    console.log('[AI SERVICE - SIMULACIÓN LOCAL] Generando respuesta simulada.');
    return {
      success: true,
      simulated: true,
      content: `[Simulación IA Groq - sin GROQ_API_KEY] Análisis procesado para: "${prompt.substring(0, 100)}..."`,
      model: `${model} (simulado)`
    };
  }

  try {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await groqClient.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    });

    const content = response.choices[0]?.message?.content || '';

    return {
      success: true,
      simulated: false,
      content,
      model,
      usage: response.usage
    };
  } catch (err) {
    console.error('[AI SERVICE ERROR] Error en llamada a Groq API:', err.message);
    throw err;
  }
}

/**
 * Analizar o auditar un recibo de sueldo utilizando IA Groq
 * @param {Object} payslipData - Datos extraídos del recibo
 * @returns {Promise<Object>} Análisis y sugerencias
 */
async function analyzePayslipAI(payslipData) {
  const prompt = `Analiza los siguientes datos extraídos de un recibo de sueldo e identifica posibles anomalías o brinda un resumen ejecutivo:
${JSON.stringify(payslipData, null, 2)}

Responde en formato JSON estructurado con las siguientes claves:
- "summary": resumen general en 2 oraciones.
- "anomalies": lista de posibles inconsistencias detectadas.
- "confidenceScore": número entre 0 y 1.`;

  const systemPrompt = 'Eres un auditor contable experto en liquidación de haberes argentina. Devuelve únicamente JSON válido sin formateo adicional.';

  const result = await generateCompletion({
    prompt,
    systemPrompt,
    temperature: 0.2
  });

  return result;
}

/**
 * Estado actual del servicio de IA
 */
function getAIStatus() {
  return {
    configured: isGroqConfigured,
    model: DEFAULT_MODEL,
    hasApiKey: Boolean(GROQ_API_KEY && GROQ_API_KEY !== 'gsk_...')
  };
}

module.exports = {
  generateCompletion,
  analyzePayslipAI,
  getAIStatus
};
