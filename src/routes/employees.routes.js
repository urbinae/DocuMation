import { Router } from 'express';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from '../controllers/employees.controller.js';

const router = Router();

/**
 * @route GET /api/employees
 * @desc Obtener listado de empleados (opcional ?include_archived=true)
 */
router.get('/', getEmployees);

/**
 * @route GET /api/employees/:id
 * @desc Obtener un empleado por ID
 */
router.get('/:id', getEmployeeById);

/**
 * @route POST /api/employees
 * @desc Crear un nuevo empleado
 */
router.post('/', createEmployee);

/**
 * @route PUT /api/employees/:id
 * @desc Actualizar datos de un empleado
 */
router.put('/:id', updateEmployee);

/**
 * @route DELETE /api/employees/:id
 * @desc Baja lógica de un empleado (archived = true)
 */
router.delete('/:id', deleteEmployee);

export default router;
