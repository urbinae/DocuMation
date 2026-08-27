import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Users, Settings, Upload, CheckCircle,
  Clock, Mail, Download, Trash2, Send, Plus,
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

export default function EmployeesTab({ employees, refreshData, triggerAlert }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cuil, setCuil] = useState('');
  const [password, setPassword] = useState(''); // Contraseña opcional
  const [role, setRole] = useState('empleado'); // Rol: 'empleado' o 'rrhh'
  const [puesto, setPuesto] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [editingId, setEditingId] = useState(null);

  const [csvText, setCsvText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !cuil) {
      triggerAlert('error', 'Todos los campos son obligatorios');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name, email, cuil, password: password || undefined, role, puesto, fechaIngreso })
      });
      if (!res.ok) throw new Error('Error al guardar empleado');

      triggerAlert('success', editingId ? 'Empleado actualizado correctamente.' : 'Empleado creado correctamente.');
      setName('');
      setEmail('');
      setCuil('');
      setPassword('');
      setRole('empleado');
      setPuesto('');
      setFechaIngreso('');
      setEditingId(null);
      refreshData();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleEdit = (emp) => {
    setEditingId(emp.id);
    setName(emp.name);
    setEmail(emp.email);
    setCuil(emp.cuil);
    setPassword(emp.password || '');
    setRole(emp.role || 'empleado');
    setPuesto(emp.puesto || '');
    setFechaIngreso(emp.fechaIngreso || '');
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar definitivamente este empleado?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/employees/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      triggerAlert('success', 'Empleado eliminado definitivamente.');
      refreshData();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleArchive = async (id, currentArchived) => {
    try {
      const res = await fetch(`${API_BASE}/api/employees/${id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !currentArchived })
      });
      if (!res.ok) throw new Error('Error al archivar');
      triggerAlert('success', !currentArchived ? 'Empleado archivado.' : 'Empleado restaurado.');
      refreshData();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const handleCsvImport = async () => {
    if (!csvText.trim()) {
      triggerAlert('error', 'El cuadro de texto de CSV está vacío.');
      return;
    }

    const lines = csvText.split('\n');
    const importedEmployees = [];

    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 3) {
        const namePart = parts[0].trim();
        const emailPart = parts[1].trim();
        const cuilPart = parts[2].trim();

        if (namePart.toLowerCase() !== 'nombre' && emailPart.includes('@')) {
          importedEmployees.push({
            name: namePart,
            email: emailPart,
            cuil: cuilPart
          });
        }
      }
    });

    if (importedEmployees.length === 0) {
      triggerAlert('error', 'No se pudieron parsear filas válidas. Formato requerido: Nombre, Email, CUIL');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/employees/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: importedEmployees })
      });
      const data = await res.json();
      if (!res.ok) throw new Error('Error en importación');

      triggerAlert('success', data.message);
      setCsvText('');
      setShowImport(false);
      refreshData();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  const displayedEmployees = (Array.isArray(employees) ? employees : []).filter(emp => {
    const isArchived = Boolean(emp.archived);
    return showArchived ? isArchived : !isArchived;
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px' }}>
      <div className="glass-panel" style={{ height: 'fit-content' }}>
        <h3>{editingId ? 'Editar Empleado' : 'Registrar Empleado'}</h3>
        <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
          <div className="form-group">
            <label>Nombre Completo</label>
            <input
              type="text"
              placeholder="Ej. Juan Pérez"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Email Laboral</label>
            <input
              type="email"
              placeholder="Ej. juan.perez@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>CUIL / CUIT</label>
            <input
              type="text"
              placeholder="Ej. 20-12345678-9"
              value={cuil}
              onChange={(e) => setCuil(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Contraseña Portal (Opcional)</label>
            <input
              type="text"
              placeholder="Dejar vacío para usar su CUIL limpio"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Rol de Usuario</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="empleado">Empleado</option>
              <option value="rrhh">Personal de RRHH</option>
            </select>
          </div>
          <div className="form-group">
            <label>Puesto / Cargo</label>
            <input
              type="text"
              placeholder="Ej. Desarrollador Web"
              value={puesto}
              onChange={(e) => setPuesto(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Fecha de Ingreso</label>
            <input
              type="date"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              <Plus size={16} />
              {editingId ? 'Actualizar' : 'Agregar'}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditingId(null);
                  setName('');
                  setEmail('');
                  setCuil('');
                  setPassword('');
                  setRole('empleado');
                  setPuesto('');
                  setFechaIngreso('');
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />

        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setShowImport(!showImport)}>
          <FileUp size={16} />
          Importar desde CSV / Excel
        </button>

        {showImport && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label>Pegar filas de nómina (CSV):</label>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Estructura: Nombre, Email, CUIL (una fila por empleado)</p>
            <textarea
              rows={5}
              placeholder="Juan Perez,juan@ejemplo.com,20-12345678-9&#10;Maria Gomez,maria@ejemplo.com,27-98765432-1"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'white',
                padding: '8px',
                fontFamily: 'monospace',
                fontSize: '12px',
                outline: 'none'
              }}
            />
            <button className="btn btn-accent" onClick={handleCsvImport}>
              Procesar Nómina
            </button>
          </div>
        )}
      </div>

      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Lista de Empleados ({displayedEmployees.length})</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="show-archived"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <label htmlFor="show-archived" style={{ fontSize: '13px', margin: 0, textTransform: 'none' }}>Ver Archivados</label>
          </div>
        </div>
        <div className="table-container">
          {displayedEmployees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              {showArchived ? 'No hay empleados archivados.' : 'No hay empleados registrados. Agrega uno o importa un CSV.'}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>CUIL</th>
                  <th>Puesto</th>
                  <th>Fecha Ingreso</th>
                  <th>Rol</th>
                  <th>Contraseña Portal</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {employees.filter(emp => showArchived ? emp.archived : !emp.archived).map(emp => (
                  <tr key={emp.id} style={{ opacity: emp.archived ? 0.6 : 1 }}>
                    <td style={{ fontWeight: '600' }}>{emp.name}</td>
                    <td>{emp.email}</td>
                    <td style={{ fontFamily: 'monospace' }}>{emp.cuil}</td>
                    <td>{emp.puesto || <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No definido</span>}</td>
                    <td>{emp.fechaIngreso ? new Date(emp.fechaIngreso + 'T00:00:00').toLocaleDateString('es-AR') : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No definida</span>}</td>
                    <td>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          borderRadius: '12px',
                          background: emp.role === 'rrhh' ? 'rgba(255, 112, 67, 0.15)' : 'rgba(255,255,255,0.05)',
                          color: emp.role === 'rrhh' ? '#ff7043' : 'var(--text-secondary)',
                          border: emp.role === 'rrhh' ? '1px solid rgba(255, 112, 67, 0.3)' : '1px solid rgba(255,255,255,0.1)',
                          display: 'inline-block',
                          fontWeight: '600'
                        }}
                      >
                        {emp.role === 'rrhh' ? 'RRHH' : 'Empleado'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: emp.password ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {emp.password ? emp.password : `${emp.cuil.replace(/\D/g, '')} (Defecto)`}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px' }}
                          onClick={() => handleEdit(emp)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', color: emp.archived ? 'var(--success)' : 'var(--warning)' }}
                          onClick={() => handleArchive(emp.id, emp.archived)}
                          title={emp.archived ? "Restaurar" : "Archivar"}
                        >
                          {emp.archived ? <RefreshCw size={14} /> : <FileDown size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
