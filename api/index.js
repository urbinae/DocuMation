const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { supabase } = require('./lib/supabase');
const { validate, payslipSchema, clientSchema, contractSchema } = require('./lib/zodSchemas');

// Sub-routers modulares
const employeesRouter = require('./routes/employees');
const { authRouter, handleLogin, handleGoogleLogin, handlePushSubscription } = require('./routes/auth');
const settingsRouter = require('./routes/settings');
const { payslipsRouter, handleSignByToken, downloadHandler, getPayslipsByEmployeeHandler, viewPayslipHandler } = require('./routes/payslips');
const aiRouter = require('./routes/ai');
const emailService = require('./services/emailService');
const aiService = require('./services/aiService');

const app = express();

// Middlewares globales
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// -----------------------------------------------------------------------------
// Endpoint de Salud / Status
// -----------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  const port = process.env.PORT || 5000;
  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    serverless: true,
    config: {
      port: Number(port),
      baseUrl,
      companyName: process.env.COMPANY_NAME || 'e-ABC Learning',
      supabase: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      groqAi: aiService.getAIStatus(),
      emailService: emailService.getEmailServiceStatus(),
      googleAuth: {
        configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== '...'),
        allowedDomain: process.env.GOOGLE_ALLOWED_DOMAIN || 'e-abc.com'
      }
    }
  });
});

// Endpoint de estado del Servicio de Email
app.get('/api/email/status', (req, res) => {
  res.json(emailService.getEmailServiceStatus());
});

// -----------------------------------------------------------------------------
// MONTADO DE RUTAS PRINCIPALES
// -----------------------------------------------------------------------------
app.use('/api/employees', employeesRouter);
app.use('/api/auth', authRouter);
app.use('/api/employee', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/payslips', payslipsRouter);
app.use('/api/ai', aiRouter);

// -----------------------------------------------------------------------------
// Visualizador / Proxy de PDFs desde Supabase Storage
// -----------------------------------------------------------------------------
app.get('/api/payslips/view/:id/:type?', viewPayslipHandler);
app.get('/api/sign/view/:token/:type?', viewPayslipHandler);
app.get('/api/download/:type/:id', downloadHandler);
app.get('/api/download/file/:id/:type?', downloadHandler);
app.get('/api/download/signed/:id', downloadHandler);
app.get('/api/download/original/:id', downloadHandler);
app.get('/api/download/duplicado/:id', downloadHandler);

// Endpoint de Firma por Token o ID (/api/sign/:token y /api/sign-by-id/:id)
app.post('/api/sign/:token', handleSignByToken);
app.post('/api/sign-by-id/:id', handleSignByToken);
app.get('/api/sign/token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { data: payslip, error } = await supabase
      .from('payslips')
      .select('*, employees(name, cuil, email, puesto)')
      .eq('token', token)
      .maybeSingle();

    if (error || !payslip) {
      return res.status(404).json({ error: 'Token de firma no válido' });
    }
    res.json({ success: true, payslip });
  } catch (err) {
    res.status(500).json({ error: 'Error al verificar token de firma', details: err.message });
  }
});

// Alias de compatibilidad para endpoints de Portal del Empleado (/api/employee/*)
app.post('/api/employee/login', handleLogin);
app.post('/api/employee/google-login', handleGoogleLogin);
app.post('/api/employee/push-subscription', handlePushSubscription);
app.get('/api/employee/payslips/:employeeId', getPayslipsByEmployeeHandler);


// -----------------------------------------------------------------------------
// CLIENTS B2B ENDPOINTS (/api/clients)
// -----------------------------------------------------------------------------
app.get('/api/clients', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener clientes', details: err.message });
  }
});

app.post('/api/clients', validate(clientSchema), async (req, res) => {
  try {
    const clientData = req.body;
    const { data, error } = await supabase
      .from('clients')
      .upsert(clientData, { onConflict: 'email' })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar cliente', details: err.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('clients').delete().eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar cliente', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// CONTRACTS B2B ENDPOINTS (/api/contracts)
// -----------------------------------------------------------------------------
app.get('/api/contracts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        clients (
          id,
          name,
          email,
          empresa
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener contratos', details: err.message });
  }
});

app.post('/api/contracts', validate(contractSchema), async (req, res) => {
  try {
    const contractData = req.body;
    const { data, error } = await supabase
      .from('contracts')
      .insert([contractData])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar contrato', details: err.message });
  }
});

app.delete('/api/contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('contracts').delete().eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Contrato eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar contrato', details: err.message });
  }
});

// Handler 404 para rutas de API no encontradas
// IMPORTANTE: debe ser el ÚLTIMO middleware registrado
app.use('/api/', (req, res, next) => {
  res.status(404).json({ error: `Ruta de API '${req.originalUrl}' no encontrada` });
});

// Permite la ejecución del servidor de forma local/autónoma (node api/index.js)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
  app.listen(PORT, () => {
    console.log(`[DocuMation Backend] Servidor en ejecución en ${BASE_URL} (Puerto ${PORT})`);
  });
}

// Exportar la instancia de Express para Vercel Serverless (SIN app.listen automático)
module.exports = app;
