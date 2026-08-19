import { Router } from 'express';
import multer from 'multer';
import {
  getPayslips,
  getPayslipById,
  createPayslip,
  signPayslip,
} from '../controllers/payslips.controller.js';

const router = Router();

// Configuración de Multer para almacenamiento en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // Límite de 10 MB por archivo
  },
});

/**
 * @route GET /api/payslips
 * @desc Obtener listado de recibos de sueldo (filtrable por employee_id, status, periodo)
 */
router.get('/', getPayslips);

/**
 * @route GET /api/payslips/:id
 * @desc Obtener un recibo por su ID
 */
router.get('/:id', getPayslipById);

/**
 * @route POST /api/payslips
 * @desc Registrar recibo y subir archivo PDF al bucket 'payslips' en Supabase Storage
 */
router.post('/', upload.single('file'), createPayslip);

/**
 * @route POST /api/payslips/:id/sign
 * @desc Registrar la firma electrónica, guardar la firma PNG en el bucket 'signatures' y registrar auditoría (IP, User-Agent, timestamp)
 */
router.post('/:id/sign', upload.single('signature'), signPayslip);

export default router;
