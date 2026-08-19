import { Router } from 'express';
import { saveSubscription } from '../controllers/subscriptions.controller.js';

const router = Router();

/**
 * @route POST /api/subscriptions
 * @desc Guardar / actualizar suscripción de notificaciones Push para un empleado
 */
router.post('/', saveSubscription);

export default router;
