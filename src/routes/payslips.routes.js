import { Router } from 'express';
import multer from 'multer';
import {
  getPayslips,
  getPayslipById,
  createPayslip,
  signPayslip,
  uploadExcelPayslips,
  uploadPdfPayslip,
  sendPayslipEmail,
  deletePayslip,
  deleteBulkPayslips,
  sendBulkPayslips,
  matchPayslips,
  schedulePayslips,
  viewPayslip,
  downloadPayslip,
} from '../controllers/payslips.controller.js';

const router = Router();

// Configuración de Multer para almacenamiento en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // Límite de 20 MB por archivo
  },
});

/**
 * @route GET /api/payslips/view/:id/:type?
 * @desc Previsualización / Streaming de PDF por ID o Token
 */
router.get('/view/:id/:type?', viewPayslip);
router.get('/view/:id', viewPayslip);

/**
 * @route GET /api/payslips/download/:type/:id
 * @desc Descarga de PDF por ID o Token (original, duplicado, signed)
 */
router.get('/download/:type/:id', downloadPayslip);
router.get('/download/signed/:id', downloadPayslip);
router.get('/download/original/:id', downloadPayslip);
router.get('/download/duplicado/:id', downloadPayslip);

/**
 * @route GET /api/payslips
 * @desc Obtener listado de recibos de sueldo
 */
router.get('/', getPayslips);

/**
 * @route POST /api/payslips/upload-excel
 * @desc Carga e importación masiva desde Excel (.xlsx / .xls)
 */
router.post('/upload-excel', upload.single('file'), uploadExcelPayslips);

/**
 * @route POST /api/payslips/upload
 * @desc Carga de archivos PDF / Zip de recibos
 */
router.post('/upload', upload.single('file'), uploadPdfPayslip);

/**
 * @route POST /api/payslips/delete-bulk
 * @desc Eliminar recibos masivamente
 */
router.post('/delete-bulk', deleteBulkPayslips);

/**
 * @route POST /api/payslips/send-bulk
 * @desc Enviar recibos masivamente
 */
router.post('/send-bulk', sendBulkPayslips);

/**
 * @route POST /api/payslips/match
 * @desc Procesar coincidencia de recibos y empleados
 */
router.post('/match', matchPayslips);

/**
 * @route POST /api/payslips/schedule
 * @desc Programar envío de recibos
 */
router.post('/schedule', schedulePayslips);

/**
 * @route POST /api/payslips/send/:id
 * @desc Enviar recibo individual por correo
 */
router.post('/send/:id', sendPayslipEmail);

/**
 * @route GET /api/payslips/:id
 * @desc Obtener un recibo por su ID
 */
router.get('/:id', getPayslipById);

/**
 * @route POST /api/payslips
 * @desc Registrar recibo y subir archivo PDF al bucket 'payslips'
 */
router.post('/', upload.single('file'), createPayslip);

/**
 * @route POST /api/payslips/:id/sign
 * @desc Registrar la firma electrónica
 */
router.post('/:id/sign', upload.single('signature'), signPayslip);
router.post('/sign-by-id/:id', upload.single('signature'), signPayslip);
router.post('/sign/:token', upload.single('signature'), signPayslip);

/**
 * @route DELETE /api/payslips/:id
 * @desc Eliminar recibo por ID
 */
router.delete('/:id', deletePayslip);

export default router;
