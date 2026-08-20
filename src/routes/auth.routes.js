import { Router } from 'express';
import { loginEmployee, getGoogleConfig, googleLogin } from '../controllers/auth.controller.js';
import { getPayslips } from '../controllers/payslips.controller.js';

const router = Router();

router.post('/login', loginEmployee);
router.get('/google-config', getGoogleConfig);
router.post('/google-login', googleLogin);

// GET /api/employee/payslips/:employeeId
router.get('/payslips/:employeeId', getPayslips);

export default router;
