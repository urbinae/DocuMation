const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');

// -----------------------------------------------------------------------------
// GET /api/settings - Obtener objeto unificado con todas las configuraciones
// -----------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value');

    if (error) throw error;

    const settingsMap = {};
    (data || []).forEach(item => {
      settingsMap[item.key] = item.value;
    });

    res.json(settingsMap);
  } catch (err) {
    console.error('Error al obtener configuraciones:', err);
    res.status(500).json({ error: 'Error al obtener configuración global', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// GET /api/settings/:key - Obtener una clave específica
// -----------------------------------------------------------------------------
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: `Configuración '${key}' no encontrada` });

    res.json({ key: data.key, value: data.value });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener configuración', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/settings - Guardar/actualizar múltiples configuraciones clave-valor
// -----------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const settingsData = req.body;

    if (!settingsData || typeof settingsData !== 'object' || Array.isArray(settingsData)) {
      return res.status(400).json({ error: 'El cuerpo de la petición debe ser un objeto clave-valor' });
    }

    const keys = Object.keys(settingsData);
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No se enviaron claves para actualizar' });
    }

    const records = keys.map(key => ({
      key,
      value: settingsData[key]
    }));

    const { data, error } = await supabase
      .from('settings')
      .upsert(records, { onConflict: 'key' })
      .select();

    if (error) throw error;

    res.json({
      success: true,
      updated: (data || []).length,
      message: 'Configuración guardada exitosamente'
    });
  } catch (err) {
    console.error('Error al guardar configuración:', err);
    res.status(500).json({ error: 'Error al guardar configuración', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// DELETE /api/settings/:key - Eliminar una configuración por clave
// -----------------------------------------------------------------------------
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { error } = await supabase
      .from('settings')
      .delete()
      .eq('key', key);

    if (error) throw error;

    res.json({ success: true, message: `Configuración '${key}' eliminada correctamente` });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar configuración', details: err.message });
  }
});

module.exports = router;
