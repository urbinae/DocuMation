import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Importar rutas
import authRoutes from './src/routes/auth.routes.js';
import employeesRoutes from './src/routes/employees.routes.js';
import payslipsRoutes from './src/routes/payslips.routes.js';
import subscriptionsRoutes from './src/routes/subscriptions.routes.js';
import settingsRoutes from './src/routes/settings.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Ruta para comprobación de estado de la API
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Servidor Express de DocuMation operativo con conexión Supabase',
    timestamp: new Date().toISOString(),
  });
});

// Registro de Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/employee', authRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/payslips', payslipsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/push_subscriptions', subscriptionsRoutes);
app.use('/api/settings', settingsRoutes);

// Manejador de rutas no encontradas (404)
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `La ruta de la API [${req.method} ${req.originalUrl}] no existe.`,
  });
});

// Manejador global de errores (500)
app.use((err, req, res, next) => {
  console.error('Error no capturado en el servidor:', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'Error interno en el servidor.',
  });
});

// Iniciar servidor solo si no está siendo importado como módulo ni en Vercel Serverless
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 DocuMation Backend API escuchando en puerto ${PORT}`);
    console.log(`📍 Endpoint de salud: http://localhost:${PORT}/api/health`);
    console.log(`=======================================================`);
  });
}

export default app;
