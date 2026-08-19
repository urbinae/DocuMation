import { Router } from 'express';
import { getSettings, saveSettings } from '../controllers/settings.controller.js';

const router = Router();

router.get('/', getSettings);
router.post('/', saveSettings);

export default router;
