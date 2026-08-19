import { Router } from 'express';
import { loginEmployee, getGoogleConfig, googleLogin } from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', loginEmployee);
router.get('/google-config', getGoogleConfig);
router.post('/google-login', googleLogin);

export default router;
