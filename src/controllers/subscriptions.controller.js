import { supabaseAdmin } from '../config/supabase.js';

/**
 * Registrar o actualizar una suscripción a notificaciones push
 * POST /api/subscriptions
 */
export const saveSubscription = async (req, res) => {
  try {
    const { employee_id, endpoint, keys, keys_p256dh, keys_auth } = req.body;

    const p256dhKey = keys_p256dh || keys?.p256dh;
    const authKey = keys_auth || keys?.auth;

    if (!employee_id || !endpoint || !p256dhKey || !authKey) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Los parámetros employee_id, endpoint y keys (p256dh, auth) son obligatorios.',
      });
    }

    const subscriptionRecord = {
      employee_id,
      endpoint,
      keys_p256dh: p256dhKey,
      keys_auth: authKey,
    };

    // Upsert según el endpoint único
    const { data, error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert([subscriptionRecord], { onConflict: 'endpoint' })
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Database Error',
        message: 'Error al guardar la suscripción Push en Supabase.',
        details: error.message,
      });
    }

    return res.status(201).json({
      message: 'Suscripción Push registrada exitosamente',
      subscription: data,
    });
  } catch (err) {
    console.error('Error en saveSubscription:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error inesperado al guardar la suscripción Push.',
      details: err.message,
    });
  }
};
