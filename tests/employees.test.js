const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Mapeo en memoria para simular base de datos PostgreSQL/Supabase en tests aislados
let mockDb = [];

// Mock de Supabase Client para pruebas unitarias de controladores
const mockSupabase = {
  from(table) {
    if (table !== 'employees') {
      throw new Error(`Tabla ${table} no mockeada`);
    }

    let filters = [];
    let isSingle = false;
    let isMaybeSingle = false;
    let isDelete = false;
    let isUpdate = false;
    let updateData = null;
    let insertData = null;
    let isUpsert = false;

    const builder = {
      select(cols) {
        return builder;
      },
      order(col, opts) {
        return builder;
      },
      eq(col, val) {
        filters.push({ col, val });
        return builder;
      },
      single() {
        isSingle = true;
        return builder.execute();
      },
      maybeSingle() {
        isMaybeSingle = true;
        return builder.execute();
      },
      insert(arr) {
        insertData = arr;
        return builder;
      },
      update(obj) {
        isUpdate = true;
        updateData = obj;
        return builder;
      },
      upsert(arr, opts) {
        isUpsert = true;
        insertData = Array.isArray(arr) ? arr : [arr];
        return builder;
      },
      delete() {
        isDelete = true;
        return builder;
      },
      async then(resolve, reject) {
        try {
          const res = await builder.execute();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      },
      async execute() {
        // DELETE
        if (isDelete) {
          const idFilter = filters.find(f => f.col === 'id');
          if (idFilter) {
            if (idFilter.val === 'invalid-uuid-syntax') {
              return { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } };
            }
            const idx = mockDb.findIndex(e => e.id === idFilter.val);
            if (idx !== -1) {
              const deleted = mockDb.splice(idx, 1);
              return { data: deleted, error: null };
            }
            return { data: [], error: null };
          }
          return { data: [], error: null };
        }

        // UPDATE / ARCHIVE
        if (isUpdate) {
          const idFilter = filters.find(f => f.col === 'id');
          if (idFilter) {
            if (idFilter.val === 'invalid-uuid-syntax') {
              return { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } };
            }
            const emp = mockDb.find(e => e.id === idFilter.val);
            if (!emp) {
              return { data: isMaybeSingle ? null : null, error: null };
            }
            
            // Check unique constraint violation on CUIL/Email if updated
            if (updateData.email && mockDb.some(e => e.id !== emp.id && e.email === updateData.email)) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "employees_email_key"', details: 'Key (email)' } };
            }
            if (updateData.cuil && mockDb.some(e => e.id !== emp.id && e.cuil === updateData.cuil)) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "employees_cuil_key"', details: 'Key (cuil)' } };
            }

            Object.assign(emp, updateData);
            return { data: isSingle || isMaybeSingle ? emp : [emp], error: null };
          }
        }

        // INSERT
        if (insertData && !isUpsert) {
          const newEmp = insertData[0];
          // Check duplicates
          if (mockDb.some(e => e.email === newEmp.email)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "employees_email_key"', details: 'Key (email)' } };
          }
          if (mockDb.some(e => e.cuil === newEmp.cuil)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "employees_cuil_key"', details: 'Key (cuil)' } };
          }

          const created = {
            id: 'uuid-' + Math.random().toString(36).substring(2, 9),
            ...newEmp,
            created_at: new Date().toISOString()
          };
          mockDb.push(created);
          return { data: isSingle ? created : [created], error: null };
        }

        // UPSERT
        if (isUpsert && insertData) {
          const results = [];
          for (const item of insertData) {
            const existingIdx = mockDb.findIndex(e => e.email === item.email);
            if (existingIdx !== -1) {
              mockDb[existingIdx] = { ...mockDb[existingIdx], ...item };
              results.push(mockDb[existingIdx]);
            } else {
              if (mockDb.some(e => e.cuil === item.cuil)) {
                return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "employees_cuil_key"', details: 'Key (cuil)' } };
              }
              const created = {
                id: 'uuid-' + Math.random().toString(36).substring(2, 9),
                ...item,
                created_at: new Date().toISOString()
              };
              mockDb.push(created);
              results.push(created);
            }
          }
          return { data: isSingle ? results[0] : results, error: null };
        }

        // SELECT / GET
        let result = [...mockDb];
        for (const f of filters) {
          if (f.val === 'invalid-uuid-syntax') {
            return { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } };
          }
          result = result.filter(e => e[f.col] === f.val);
        }

        if (isSingle || isMaybeSingle) {
          const singleItem = result[0] || null;
          return { data: singleItem, error: null };
        }

        return { data: result, error: null };
      }
    };

    return builder;
  }
};

// Reemplazar módulo de supabase en runtime para testing
require('../api/lib/supabase').supabase = mockSupabase;

const app = require('../api/index');

let server;
let port;

function startServer() {
  return new Promise((resolve) => {
    mockDb = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Juan Pérez',
        email: 'juan.perez@empresa.com',
        cuil: '20-12345678-9',
        role: 'empleado',
        puesto: 'Desarrollador',
        fecha_ingreso: '2024-01-15',
        archived: false,
        created_at: '2024-01-15T10:00:00Z'
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Maria Gomez',
        email: 'maria.gomez@empresa.com',
        cuil: '27-98765432-1',
        role: 'rrhh',
        puesto: 'Analista RRHH',
        fecha_ingreso: '2023-05-10',
        archived: true,
        created_at: '2023-05-10T10:00:00Z'
      }
    ];

    server = http.createServer(app);
    server.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });
}

// Helper HTTP request
async function request(method, path, body = null) {
  if (!port) await startServer();
  const url = `http://localhost:${port}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  const options = { method, headers };

  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        try {
          const parsed = rawData ? JSON.parse(rawData) : null;
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: rawData });
        }
      });
    });

    req.on('error', reject);
    if (body !== null) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

describe('Suite de Pruebas Módulo Empleados (/api/employees)', () => {

  after(() => {
    if (server) {
      server.close();
    }
  });

  // ---------------------------------------------------------------------------
  // 1. GET /api/employees
  // ---------------------------------------------------------------------------
  test('GET /api/employees - Obtener todos los empleados', async () => {
    const res = await request('GET', '/api/employees');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 2);
    assert.strictEqual(res.body[0].fechaIngreso, '2024-01-15');
  });

  test('GET /api/employees?archived=false - Filtrar no archivados', async () => {
    const res = await request('GET', '/api/employees?archived=false');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].archived, false);
    assert.strictEqual(res.body[0].name, 'Juan Pérez');
  });

  test('GET /api/employees?archived=true - Filtrar archivados', async () => {
    const res = await request('GET', '/api/employees?archived=true');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].archived, true);
    assert.strictEqual(res.body[0].name, 'Maria Gomez');
  });

  // ---------------------------------------------------------------------------
  // 2. GET /api/employees/:id
  // ---------------------------------------------------------------------------
  test('GET /api/employees/:id - Empleado existente', async () => {
    const res = await request('GET', '/api/employees/11111111-1111-1111-1111-111111111111');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, '11111111-1111-1111-1111-111111111111');
    assert.strictEqual(res.body.name, 'Juan Pérez');
  });

  test('GET /api/employees/:id - Retornar 404 para ID inexistente', async () => {
    const res = await request('GET', '/api/employees/99999999-9999-9999-9999-999999999999');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Empleado no encontrado');
  });

  test('GET /api/employees/:id - Retornar 404 para sintaxis UUID inválida', async () => {
    const res = await request('GET', '/api/employees/invalid-uuid-syntax');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Empleado no encontrado');
  });

  // ---------------------------------------------------------------------------
  // 3. POST /api/employees (Creación y Edición)
  // ---------------------------------------------------------------------------
  test('POST /api/employees - Crear nuevo empleado válido (201 Created)', async () => {
    const payload = {
      name: 'Carlos Ruiz',
      email: 'carlos.ruiz@empresa.com',
      cuil: '20-33444555-6',
      role: 'empleado',
      puesto: 'DevOps Engineer',
      fechaIngreso: '2024-02-01'
    };
    const res = await request('POST', '/api/employees', payload);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.name, 'Carlos Ruiz');
    assert.strictEqual(res.body.email, 'carlos.ruiz@empresa.com');
    assert.strictEqual(res.body.fechaIngreso, '2024-02-01');
  });

  test('POST /api/employees - Crear empleado con id: null en el payload (201 Created)', async () => {
    const payload = {
      id: null,
      name: 'Eimar',
      email: 'eimar@e-abclearning.com',
      cuil: '20-12312312-3',
      role: 'empleado',
      puesto: 'Desarrollador',
      fechaIngreso: '2010-10-10'
    };
    const res = await request('POST', '/api/employees', payload);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.name, 'Eimar');
    assert.strictEqual(res.body.email, 'eimar@e-abclearning.com');
    assert.strictEqual(res.body.fechaIngreso, '2010-10-10');
  });

  test('POST /api/employees - Error validación CUIL inválido (400 Bad Request)', async () => {
    const payload = {
      name: 'Pedro Picapiedra',
      email: 'pedro@empresa.com',
      cuil: '1234'
    };
    const res = await request('POST', '/api/employees', payload);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Error de validación de datos');
    assert.ok(res.body.details.some(d => d.field === 'cuil'));
  });

  test('POST /api/employees - Error validación Email inválido (400 Bad Request)', async () => {
    const payload = {
      name: 'Ana López',
      email: 'email-invalido',
      cuil: '27-11222333-4'
    };
    const res = await request('POST', '/api/employees', payload);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Error de validación de datos');
    assert.ok(res.body.details.some(d => d.field === 'email'));
  });

  test('POST /api/employees - Error de duplicado Email o CUIL (409 Conflict)', async () => {
    const payload = {
      name: 'Falso Juan',
      email: 'juan.perez@empresa.com',
      cuil: '20-99999999-9'
    };
    const res = await request('POST', '/api/employees', payload);
    assert.strictEqual(res.status, 409);
    assert.ok(res.body.error.includes('ya se encuentra registrado'));
  });

  test('POST /api/employees - Actualizar empleado existente (200 OK)', async () => {
    const payload = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Juan Pérez Modificado',
      email: 'juan.perez@empresa.com',
      cuil: '20-12345678-9',
      role: 'rrhh',
      puesto: 'Líder Técnico'
    };
    const res = await request('POST', '/api/employees', payload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.name, 'Juan Pérez Modificado');
    assert.strictEqual(res.body.puesto, 'Líder Técnico');
    assert.strictEqual(res.body.role, 'rrhh');
  });

  test('POST /api/employees - Intentar actualizar ID inexistente (404 Not Found)', async () => {
    const payload = {
      id: '88888888-8888-8888-8888-888888888888',
      name: 'Fantasma',
      email: 'fantasma@empresa.com',
      cuil: '20-88888888-8'
    };
    const res = await request('POST', '/api/employees', payload);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Empleado no encontrado para actualizar');
  });

  // ---------------------------------------------------------------------------
  // 4. POST /api/employees/import (Carga Masiva)
  // ---------------------------------------------------------------------------
  test('POST /api/employees/import - Importación masiva correcta (200 OK)', async () => {
    const payload = {
      employees: [
        { name: 'Emp 1', email: 'emp1@test.com', cuil: '20-11111111-1' },
        { name: 'Emp 2', email: 'emp2@test.com', cuil: '20-22222222-2' }
      ]
    };
    const res = await request('POST', '/api/employees/import', payload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.count, 2);
    assert.ok(res.body.message.includes('Se procesaron e importaron 2 empleados'));
  });

  test('POST /api/employees/import - Error con lista vacía (400 Bad Request)', async () => {
    const payload = { employees: [] };
    const res = await request('POST', '/api/employees/import', payload);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Error de validación de datos');
  });

  // ---------------------------------------------------------------------------
  // 5. PATCH /api/employees/:id/archive
  // ---------------------------------------------------------------------------
  test('PATCH /api/employees/:id/archive - Archivar empleado', async () => {
    const res = await request('PATCH', '/api/employees/11111111-1111-1111-1111-111111111111/archive', { archived: true });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.archived, true);
  });

  test('PATCH /api/employees/:id/archive - Restaurar empleado', async () => {
    const res = await request('PATCH', '/api/employees/11111111-1111-1111-1111-111111111111/archive', { archived: false });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.archived, false);
  });

  test('PATCH /api/employees/:id/archive - Error si archived no es booleano (400 Bad Request)', async () => {
    const res = await request('PATCH', '/api/employees/11111111-1111-1111-1111-111111111111/archive', { archived: "si" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'El campo archived debe ser un booleano (true/false)');
  });

  test('PATCH /api/employees/:id/archive - Error 404 para ID inexistente', async () => {
    const res = await request('PATCH', '/api/employees/99999999-9999-9999-9999-999999999999/archive', { archived: true });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Empleado no encontrado');
  });

  // ---------------------------------------------------------------------------
  // 6. DELETE /api/employees/:id
  // ---------------------------------------------------------------------------
  test('DELETE /api/employees/:id - Eliminación física de empleado existente (200 OK)', async () => {
    const res = await request('DELETE', '/api/employees/22222222-2222-2222-2222-222222222222');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'Empleado eliminado definitivamente');

    // Verificar que ya no exista
    const getRes = await request('GET', '/api/employees/22222222-2222-2222-2222-222222222222');
    assert.strictEqual(getRes.status, 404);
  });

  test('DELETE /api/employees/:id - Error 404 al intentar eliminar ID inexistente', async () => {
    const res = await request('DELETE', '/api/employees/99999999-9999-9999-9999-999999999999');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'Empleado no encontrado');
  });

  // ---------------------------------------------------------------------------
  // 7. Casos de borde / Payload malformado
  // ---------------------------------------------------------------------------
  test('POST /api/employees - Payload JSON malformado (400 Bad Request)', async () => {
    const res = await request('POST', '/api/employees', '{ bad json ');
    assert.strictEqual(res.status, 400);
  });
});
