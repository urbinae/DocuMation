import { Router } from 'express';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  archiveEmployee,
  importEmployees,
} from '../controllers/employees.controller.js';

const router = Router();

/**
 * @route GET /api/employees
 * @desc Obtener listado de empleados
 */
router.get('/', getEmployees);

/**
 * @route POST /api/employees/import
 * @desc Importación masiva desde CSV
 */
router.post('/import', importEmployees);

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
 * @route PATCH /api/employees/:id/archive
 * @desc Archivar o desarchivar empleado
 */
router.patch('/:id/archive', archiveEmployee);

/**
 * @route DELETE /api/employees/:id
 * @desc Eliminar empleado
 */
router.delete('/:id', deleteEmployee);

export default router;
