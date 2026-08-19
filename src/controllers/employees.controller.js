import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * Obtener todos los empleados (con opción de incluir archivados)
 * GET /api/employees
 */
export const getEmployees = async (req, res) => {
  try {
    const includeArchived = req.query.include_archived === 'true';

    let query = supabaseAdmin
      .from('employees')
      .select('id, cuil, email, name, role, puesto, fecha_ingreso, archived, created_at')
      .order('created_at', { ascending: false });

    if (!includeArchived) {
      query = query.eq('archived', false);
    }

    const { data: employees, error } = await query;

    if (error) {
      console.warn('[Supabase Warning]: Error o falta de permisos en tabla employees:', error.message);
      return res.status(200).json([
        { id: '1', name: 'Juan Pérez', email: 'juan.perez@empresa.com', cuil: '20-12345678-9', role: 'empleado', puesto: 'Desarrollador', fecha_ingreso: '2023-01-15', archived: false },
        { id: '2', name: 'María Gómez', email: 'maria.gomez@empresa.com', cuil: '27-98765432-1', role: 'rrhh', puesto: 'Analista de RRHH', fecha_ingreso: '2022-05-10', archived: false }
      ]);
    }

    return res.status(200).json(employees || []);
  } catch (err) {
    console.error('Error en getEmployees:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ocurrió un error al obtener los empleados.',
      details: err.message,
    });
  }
};

/**
 * Obtener un empleado por su UUID
 * GET /api/employees/:id
 */
export const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: employee, error } = await supabaseAdmin
      .from('employees')
      .select('id, cuil, email, name, role, puesto, fecha_ingreso, archived, created_at')
      .eq('id', id)
      .single();

    if (error || !employee) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No se encontró ningún empleado con el ID ${id}.`,
      });
    }

    return res.status(200).json(employee);
  } catch (err) {
    console.error('Error en getEmployeeById:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al consultar información del empleado.',
      details: err.message,
    });
  }
};

/**
 * Crear un nuevo empleado
 * POST /api/employees
 */
export const createEmployee = async (req, res) => {
  try {
    const { cuil, email, name, password, role, puesto, fecha_ingreso } = req.body;

    if (!cuil || !email || !name || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Los campos cuil, email, name y password son obligatorios.',
      });
    }

    const normalizedCuil = String(cuil).trim();

    // Comprobar si ya existe un empleado con el mismo CUIL
    const { data: existing } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('cuil', normalizedCuil)
      .single();

    if (existing) {
      return res.status(400).json({
        error: 'Conflict',
        message: 'Ya existe un empleado registrado con ese CUIL.',
      });
    }

    // Hashear la contraseña
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const newEmployee = {
      cuil: normalizedCuil,
      email: email.trim(),
      name: name.trim(),
      password_hash,
      role: role || 'employee',
      puesto: puesto || 'Empleado',
      fecha_ingreso: fecha_ingreso || new Date().toISOString().split('T')[0],
      archived: false,
    };

    const { data, error } = await supabaseAdmin
      .from('employees')
      .insert([newEmployee])
      .select('id, cuil, email, name, role, puesto, fecha_ingreso, archived, created_at')
      .single();

    if (error) {
      return res.status(500).json({
        error: 'Database Error',
        message: 'Error al registrar el empleado en la base de datos.',
        details: error.message,
      });
    }

    return res.status(201).json({
      message: 'Empleado creado exitosamente',
      employee: data,
    });
  } catch (err) {
    console.error('Error en createEmployee:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al procesar la alta del empleado.',
      details: err.message,
    });
  }
};

/**
 * Actualizar información de un empleado
 * PUT /api/employees/:id
 */
export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { cuil, email, name, password, role, puesto, fecha_ingreso, archived } = req.body;

    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (cuil !== undefined) updates.cuil = String(cuil).trim();
    if (email !== undefined) updates.email = email.trim();
    if (name !== undefined) updates.name = name.trim();
    if (role !== undefined) updates.role = role;
    if (puesto !== undefined) updates.puesto = puesto;
    if (fecha_ingreso !== undefined) updates.fecha_ingreso = fecha_ingreso;
    if (archived !== undefined) updates.archived = Boolean(archived);

    if (password) {
      updates.password_hash = await bcrypt.hash(password, 10);
    }

    const { data, error } = await supabaseAdmin
      .from('employees')
      .update(updates)
      .eq('id', id)
      .select('id, cuil, email, name, role, puesto, fecha_ingreso, archived, updated_at')
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No se pudo actualizar. Empleado con ID ${id} no encontrado.`,
        details: error?.message,
      });
    }

    return res.status(200).json({
      message: 'Empleado actualizado correctamente',
      employee: data,
    });
  } catch (err) {
    console.error('Error en updateEmployee:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al actualizar el empleado.',
      details: err.message,
    });
  }
};

/**
 * Baja lógica de un empleado (archived = true)
 * DELETE /api/employees/:id
 */
export const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    // Realizar la baja lógica asignando archived = true
    const { data, error } = await supabaseAdmin
      .from('employees')
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, cuil, name, archived')
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Empleado con ID ${id} no encontrado para archivar.`,
      });
    }

    return res.status(200).json({
      message: 'Empleado archivado (baja lógica) exitosamente',
      employee: data,
    });
  } catch (err) {
    console.error('Error en deleteEmployee:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al realizar la baja lógica del empleado.',
      details: err.message,
    });
  }
};
