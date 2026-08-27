const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { validate, employeeSchema, employeeImportSchema } = require('../lib/zodSchemas');

// Helper para formatear empleado hacia el frontend (mapea fecha_ingreso -> fechaIngreso)
function formatEmployee(emp) {
  if (!emp) return null;
  return {
    ...emp,
    fechaIngreso: emp.fecha_ingreso || emp.fechaIngreso || null
  };
}

// -----------------------------------------------------------------------------
// GET /api/employees - Obtener lista de empleados
// -----------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { archived } = req.query;
    let query = supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false });

    if (archived === 'true' || archived === 'false') {
      query = query.eq('archived', archived === 'true');
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Error al obtener empleados de la base de datos', details: error.message });
    }

    const formatted = (data || []).map(formatEmployee);
    res.json(formatted);
  } catch (err) {
    console.error('Error en GET /api/employees:', err);
    res.status(500).json({ error: 'Error al obtener empleados', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// GET /api/employees/:id - Obtener empleado por ID
// -----------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code === '22P02') {
        return res.status(404).json({ error: 'Empleado no encontrado' });
      }
      return res.status(500).json({ error: 'Error al obtener empleado de la base de datos', details: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    res.json(formatEmployee(data));
  } catch (err) {
    console.error('Error en GET /api/employees/:id:', err);
    res.status(500).json({ error: 'Error al obtener empleado', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/employees - Crear o actualizar empleado (Upsert)
// -----------------------------------------------------------------------------
router.post('/', validate(employeeSchema), async (req, res) => {
  try {
    const {
      id,
      name,
      email,
      cuil,
      role = 'empleado',
      puesto = null,
      fecha_ingreso,
      fechaIngreso,
      archived = false
    } = req.body;

    const record = {
      name,
      email,
      cuil,
      role,
      puesto: puesto || null,
      fecha_ingreso: fecha_ingreso || fechaIngreso || null,
      archived: Boolean(archived)
    };

    if (id) {
      // Verificar si el empleado con este ID existe antes de actualizar
      const { data: existing, error: findErr } = await supabase
        .from('employees')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (findErr && findErr.code === '22P02') {
        return res.status(404).json({ error: 'Empleado no encontrado para actualizar' });
      }
      if (!existing) {
        return res.status(404).json({ error: 'Empleado no encontrado para actualizar' });
      }

      const { data, error } = await supabase
        .from('employees')
        .update(record)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          const isCuil = error.details?.includes('cuil') || error.message?.includes('cuil');
          return res.status(409).json({
            error: `El ${isCuil ? 'CUIL' : 'Email'} ya se encuentra registrado por otro empleado`
          });
        }
        return res.status(500).json({ error: 'Error al actualizar empleado en la base de datos', details: error.message });
      }

      return res.status(200).json(formatEmployee(data));
    } else {
      // Creación de nuevo empleado
      const { data, error } = await supabase
        .from('employees')
        .insert([record])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          const isCuil = error.details?.includes('cuil') || error.message?.includes('cuil');
          return res.status(409).json({
            error: `El ${isCuil ? 'CUIL' : 'Email'} ya se encuentra registrado por otro empleado`
          });
        }
        return res.status(500).json({ error: 'Error al crear empleado en la base de datos', details: error.message });
      }

      return res.status(201).json(formatEmployee(data));
    }
  } catch (err) {
    console.error('Error en POST /api/employees:', err);
    res.status(500).json({ error: 'Error al guardar empleado', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/employees/import - Importación masiva de empleados
// -----------------------------------------------------------------------------
router.post('/import', validate(employeeImportSchema), async (req, res) => {
  try {
    const { employees } = req.body;

    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ error: 'La lista de empleados debe ser un array no vacío' });
    }

    const records = employees.map(emp => ({
      name: emp.name,
      email: emp.email,
      cuil: emp.cuil,
      role: 'empleado',
      archived: false
    }));

    const { data, error } = await supabase
      .from('employees')
      .upsert(records, { onConflict: 'email' })
      .select();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Error de duplicación durante la importación: Existen CUILs o emails repetidos'
        });
      }
      return res.status(500).json({ error: 'Error al importar empleados en la base de datos', details: error.message });
    }

    res.status(200).json({
      success: true,
      count: (data || []).length,
      message: `Se procesaron e importaron ${(data || []).length} empleados correctamente.`,
      employees: (data || []).map(formatEmployee)
    });
  } catch (err) {
    console.error('Error en importación masiva de empleados:', err);
    res.status(500).json({ error: 'Error en la importación de empleados', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// PATCH /api/employees/:id/archive - Archivar o restaurar empleado
// -----------------------------------------------------------------------------
router.patch('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    const { archived } = req.body;

    if (typeof archived !== 'boolean') {
      return res.status(400).json({ error: 'El campo archived debe ser un booleano (true/false)' });
    }

    const { data, error } = await supabase
      .from('employees')
      .update({ archived })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '22P02') {
        return res.status(404).json({ error: 'Empleado no encontrado' });
      }
      return res.status(500).json({ error: 'Error al archivar empleado en la base de datos', details: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    res.json(formatEmployee(data));
  } catch (err) {
    console.error('Error al archivar empleado:', err);
    res.status(500).json({ error: 'Error al archivar empleado', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// DELETE /api/employees/:id - Eliminar empleado definitivamente
// -----------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      if (error.code === '22P02') {
        return res.status(404).json({ error: 'Empleado no encontrado' });
      }
      return res.status(500).json({ error: 'Error al eliminar empleado en la base de datos', details: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    res.json({ success: true, message: 'Empleado eliminado definitivamente' });
  } catch (err) {
    console.error('Error al eliminar empleado:', err);
    res.status(500).json({ error: 'Error al eliminar empleado', details: err.message });
  }
});

module.exports = router;
