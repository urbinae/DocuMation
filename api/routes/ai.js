const express = require('express');
const router = express.Router();
const { generateCompletion, analyzePayslipAI, getAIStatus } = require('../services/aiService');

/**
 * GET /api/ai/status - Estado del cliente Groq IA
 */
router.get('/status', (req, res) => {
  res.json(getAIStatus());
});

/**
 * POST /api/ai/completion - Generar respuesta de texto con IA Groq
 */
router.post('/completion', async (req, res) => {
  try {
    const { prompt, systemPrompt, model, temperature } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'El campo prompt es obligatorio' });
    }

    const result = await generateCompletion({ prompt, systemPrompt, model, temperature });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar solicitud de IA Groq', details: err.message });
  }
});

/**
 * POST /api/ai/analyze-payslip - Análisis/Auditoría de un recibo de sueldo con IA
 */
router.post('/analyze-payslip', async (req, res) => {
  try {
    const { payslipData } = req.body;
    if (!payslipData) {
      return res.status(400).json({ error: 'Se requiere el parámetro payslipData' });
    }

    const result = await analyzePayslipAI(payslipData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Error en la auditoría del recibo con IA', details: err.message });
  }
});

module.exports = router;
