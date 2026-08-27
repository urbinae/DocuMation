import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Users, Settings, Upload, CheckCircle,
  Clock, Mail, Download, Trash2, Send, Plus,
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

export default function PayslipsTab({ payslips, employees, refreshData, triggerAlert }) {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Estados para Programación de Envío
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState([]);
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);

  // Nuevos Estados para Autodetección e Informe Resumen
  const [showAutoDetectModal, setShowAutoDetectModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [pendingUploadFiles, setPendingUploadFiles] = useState([]);
  const [uploadSummary, setUploadSummary] = useState(null);

  // Estados para Resolución de Conflictos y Borrado Masivo
  const [conflictPeriods, setConflictPeriods] = useState([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [uploadOptions, setUploadOptions] = useState({ useAutoDetect: false });
  const [showAdvancedDeleteModal, setShowAdvancedDeleteModal] = useState(false);
  const [selectedDeletePeriods, setSelectedDeletePeriods] = useState([]);
  const [selectedDeleteEmployees, setSelectedDeleteEmployees] = useState([]);
  const [selectedDeleteStatuses, setSelectedDeleteStatuses] = useState([]);
  const [advancedDeleteConfirmInput, setAdvancedDeleteConfirmInput] = useState('');

  // Recorrer recursivamente las entradas del file system para arrastrar carpetas
  const traverseFileSystemEntry = async (entry) => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        if (entry.name.toLowerCase().endsWith('.pdf') || entry.name.toLowerCase().endsWith('.xlsx') || entry.name.toLowerCase().endsWith('.xls')) {
          entry.file((file) => resolve([file]), () => resolve([]));
        } else {
          resolve([]);
        }
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const filesAccumulated = [];

        const readEntries = () => {
          dirReader.readEntries(async (entries) => {
            if (entries.length === 0) {
              resolve(filesAccumulated);
            } else {
              for (const childEntry of entries) {
                const childFiles = await traverseFileSystemEntry(childEntry);
                filesAccumulated.push(...childFiles);
              }
              readEntries();
            }
          }, () => resolve(filesAccumulated));
        };
        readEntries();
      } else {
        resolve([]);
      }
    });
  };

  // Obtener meses únicos presentes
  const months = [...new Set(payslips.map(p => p.month))].sort().reverse();

  // Establecer mes por defecto si está vacío
  useEffect(() => {
    if (!selectedMonth && months.length > 0) {
      setSelectedMonth(months[0]);
    } else if (!selectedMonth) {
      const d = new Date();
      const currentMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(currentMonthStr);
    }
  }, [months, selectedMonth]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // Extraer año y mes del nombre del archivo en formato YYYY-MM
  const detectPeriodFromFilename = (filename) => {
    const fn = filename.toLowerCase();

    // 1. Formato YYYY-MM (ej: 2026-04, 2026_04, 2026/04)
    const yyyyMmRegex = /\b(20\d{2})[-_/](0[1-9]|1[0-2])\b/;
    let match = fn.match(yyyyMmRegex);
    if (match) {
      return `${match[1]}-${match[2]}`;
    }

    // 2. Formato MM-YYYY (ej: 04-2026, 04/2026, 04_2026)
    const mmYyyyRegex = /\b(0[1-9]|1[0-2])[-_/](20\d{2})\b/;
    match = fn.match(mmYyyyRegex);
    if (match) {
      return `${match[2]}-${match[1]}`;
    }

    // 3. Formato textual: meses en texto + año (ej: "abril 2026", "abril de 2026", "2026 abril")
    const monthsEs = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const monthsMap = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04', 'mayo': '05', 'junio': '06',
      'julio': '07', 'agosto': '08', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };

    for (const month of monthsEs) {
      if (fn.includes(month)) {
        const yearRegex = /\b20\d{2}\b/;
        const yearMatch = fn.match(yearRegex);
        if (yearMatch) {
          return `${yearMatch[0]}-${monthsMap[month]}`;
        }
      }
    }

    return null;
  };

  const uploadFile = async (file, targetMonth, overwriteParam = 'true') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('month', targetMonth || selectedMonth);
    formData.append('overwrite', overwriteParam);

    try {
      const res = await fetch(`${API_BASE}/api/payslips/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir archivo');
      return {
        success: true,
        filename: file.name,
        month: targetMonth || selectedMonth,
        message: data.message,
        skipped: !!data.skipped,
        noTextLayer: !!data.noTextLayer
      };
    } catch (e) {
      return { success: false, filename: file.name, error: e.message };
    }
  };

  const executeExcelUpload = async (file) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('month', selectedMonth);
    formData.append('jobId', Math.random().toString(36).substring(2, 15)); // adding jobId for SSE

    try {
      const res = await fetch(`${API_BASE}/api/payslips/upload-excel`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar Excel');

      const summary = {
        total: data.total,
        successCount: data.successCount,
        failCount: data.failCount,
        skippedCount: data.skippedCount || 0,
        periods: { [selectedMonth]: data.successCount },
        errors: data.errors || [],
        warnings: []
      };

      setUploadSummary(summary);
      setShowSummaryModal(true);
      refreshData();
    } catch (e) {
      triggerAlert('error', e.message);
    } finally {
      setUploading(false);
      setPendingUploadFiles([]);
    }
  };

  const startUploadProcess = (files) => {
    const excelFile = files.find(f => f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls'));
    if (excelFile) {
      if (files.length > 1) {
        triggerAlert('warning', 'Al subir un Excel masivo, los demás archivos serán ignorados. Solo se procesará el Excel.');
      }
      executeExcelUpload(excelFile);
      return;
    }

    // Buscar si algún archivo tiene formato de fecha en su nombre
    const hasAnyPeriod = files.some(f => !!detectPeriodFromFilename(f.name));

    if (hasAnyPeriod) {
      setPendingUploadFiles(files);
      setShowAutoDetectModal(true);
    } else {
      // Subir directamente con el período del selector
      checkForConflicts(files, false);
    }
  };

  const checkForConflicts = (files, useAutoDetect) => {
    // Determinar los períodos de destino
    const targetPeriods = new Set();
    files.forEach(file => {
      let targetMonth = selectedMonth;
      if (useAutoDetect) {
        const detected = detectPeriodFromFilename(file.name);
        if (detected) {
          targetMonth = detected;
        }
      }
      targetPeriods.add(targetMonth);
    });

    // Encontrar cuáles de estos períodos ya tienen recibos en `payslips`
    const periodsWithExisting = Array.from(targetPeriods).filter(period => {
      return payslips.some(p => p.month === period);
    });

    if (periodsWithExisting.length > 0) {
      setConflictPeriods(periodsWithExisting);
      setPendingUploadFiles(files);
      setUploadOptions({ useAutoDetect });
      setShowConflictModal(true);
    } else {
      executeUploads(files, useAutoDetect, 'true');
    }
  };

  const executeUploads = async (files, useAutoDetect, overwriteParam = 'true') => {
    setUploading(true);
    const summary = {
      total: files.length,
      successCount: 0,
      failCount: 0,
      skippedCount: 0,
      periods: {}, // { '2026-04': 5 }
      errors: [],
      warnings: []
    };

    for (const file of files) {
      let targetMonth = selectedMonth;
      if (useAutoDetect) {
        const detected = detectPeriodFromFilename(file.name);
        if (detected) {
          targetMonth = detected;
        }
      }

      const result = await uploadFile(file, targetMonth, overwriteParam);
      if (result.success) {
        if (result.skipped) {
          summary.skippedCount++;
        } else {
          summary.successCount++;
          summary.periods[targetMonth] = (summary.periods[targetMonth] || 0) + 1;
          if (result.noTextLayer) {
            summary.warnings.push(`${file.name}: PDF sin texto digital (impreso en curvas/vectorial). No se pudieron extraer automáticamente los importes del recibo.`);
          }
        }
      } else {
        summary.failCount++;
        summary.errors.push(`${file.name}: ${result.error}`);
      }
    }

    setUploading(false);
    setPendingUploadFiles([]);
    refreshData();

    // Guardar resumen y mostrar modal final
    setUploadSummary(summary);
    setShowSummaryModal(true);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = Array.from(e.dataTransfer.items || []);
    let files = [];

    if (items.length > 0 && items[0].webkitGetAsEntry) {
      setUploading(true);
      for (const item of items) {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          const entryFiles = await traverseFileSystemEntry(entry);
          files.push(...entryFiles);
        }
      }
      setUploading(false);
    } else {
      files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls') || f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || f.type === 'application/vnd.ms-excel');
    }

    if (files.length === 0) {
      triggerAlert('error', 'No se encontraron archivos PDF o Excel válidos en los elementos arrastrados.');
      return;
    }

    startUploadProcess(files);
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf') || f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls') || f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || f.type === 'application/vnd.ms-excel');
    if (files.length === 0) return;

    startUploadProcess(files);
  };

  const sendInvitation = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/payslips/send/${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar email');
      triggerAlert('success', 'Email de solicitud de firma enviado.');
      refreshData();
    } catch (e) {
      triggerAlert('error', e.message);
    }
  };

  const deletePayslip = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este recibo? Se borrarán los archivos del servidor.")) return;
    try {
      const res = await fetch(`${API_BASE}/api/payslips/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      triggerAlert('success', 'Recibo eliminado.');
      refreshData();
    } catch (e) {
      triggerAlert('error', e.message);
    }
  };

  const getMatchingDeletePayslips = () => {
    return payslips.filter(p => {
      // 1. Verificar Período
      const matchPeriod = selectedDeletePeriods.length === 0 ? false : selectedDeletePeriods.includes(p.month);

      // 2. Verificar Empleado
      let matchEmployee = false;
      if (selectedDeleteEmployees.length > 0) {
        const empId = p.employeeId || p.employee_id || p.employees?.id;
        if (empId) {
          matchEmployee = selectedDeleteEmployees.includes(empId);
        } else {
          matchEmployee = selectedDeleteEmployees.includes('unassigned');
        }
      }

      // 3. Verificar Estado
      const matchStatus = selectedDeleteStatuses.length === 0 ? false : selectedDeleteStatuses.includes(p.status);

      return matchPeriod && matchEmployee && matchStatus;
    });
  };

  const handleBulkDelete = async () => {
    const matched = getMatchingDeletePayslips();
    const idsToDelete = matched.map(p => p.id);
    if (idsToDelete.length === 0) return;

    try {
      const res = await fetch(`${API_BASE}/api/payslips/delete-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar el lote');
      triggerAlert('success', `Se eliminaron ${idsToDelete.length} recibos correctamente.`);
      refreshData();
    } catch (e) {
      triggerAlert('error', e.message);
    }
  };

  const filteredPayslips = payslips.filter(p => {
    const matchMonth = p.month === selectedMonth;
    const matchStatus = filterStatus === 'Todos' || p.status === filterStatus;

    const searchLower = (search || '').toLowerCase();
    const empName = p.employeeName || p.employees?.name || '';
    const empCuil = p.employeeCuil || p.employees?.cuil || '';
    const detCuil = p.detectedCuil || p.detected_cuil || '';

    const matchSearch =
      !searchLower ||
      empName.toLowerCase().includes(searchLower) ||
      empCuil.toLowerCase().includes(searchLower) ||
      detCuil.toLowerCase().includes(searchLower);

    return matchMonth && matchStatus && matchSearch;
  });

  const totalInPeriod = payslips.filter(p => p.month === selectedMonth).length;
  const signedInPeriod = payslips.filter(p => p.month === selectedMonth && p.status === 'Firmado').length;
  const sentInPeriod = payslips.filter(p => p.month === selectedMonth && p.status === 'Enviado').length;
  const pendingInPeriod = totalInPeriod - signedInPeriod;

  const handleBulkSend = async () => {
    const unsentList = filteredPayslips.filter(p => p.status === 'Cargado' && p.employeeId && p.duplicadoPath);
    if (unsentList.length === 0) {
      triggerAlert('warning', 'No hay recibos cargados (con empleado asignado y duplicado listo) para enviar masivamente.');
      return;
    }

    if (!window.confirm(`¿Deseas enviar invitaciones de firma por email a ${unsentList.length} empleados?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/payslips/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unsentList.map(p => p.id) })
      });
      const data = await res.json();
      triggerAlert('success', data.message);
      refreshData();
    } catch (e) {
      triggerAlert('error', e.message);
    }
  };

  const handleMatchManual = async (payslipId, employeeId) => {
    try {
      const res = await fetch(`${API_BASE}/api/payslips/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payslipId, employeeId })
      });
      if (!res.ok) throw new Error('Error al asignar');
      triggerAlert('success', 'Recibo asociado correctamente.');
      refreshData();
    } catch (e) {
      triggerAlert('error', e.message);
    }
  };

  return (
    <div>
      <div className="dashboard-grid">
        <div className="glass-panel stat-card">
          <div className="stat-icon primary"><FileText size={24} /></div>
          <div className="stat-info">
            <h3>{totalInPeriod}</h3>
            <p>Recibos Totales</p>
          </div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-icon warning"><Mail size={24} /></div>
          <div className="stat-info">
            <h3>{sentInPeriod}</h3>
            <p>Enviados p/Firmar</p>
          </div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-icon success"><CheckCircle size={24} /></div>
          <div className="stat-info">
            <h3>{signedInPeriod}</h3>
            <p>Firmados (Devueltos)</p>
          </div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-icon secondary"><Clock size={24} /></div>
          <div className="stat-info">
            <h3>{pendingInPeriod}</h3>
            <p>Pendientes</p>
          </div>
        </div>
      </div>

      <div className="upload-container">
        <div className="glass-panel">
          <h3 style={{ marginBottom: '16px' }}>Cargar Recibos</h3>

          <div className="form-group">
            <label>Período de Liquidación</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>

          <div
            className={`upload-zone ${isDragOver ? 'dragover' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={(e) => {
              if (e.target.closest('.btn-folder')) return;
              document.getElementById('file-input').click();
            }}
          >
            <FileUp size={48} />
            <div>
              <p style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                {uploading ? "Procesando archivos..." : "Arrastra PDFs, Excel (.xls, .xlsx) o carpetas aquí"}
              </p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>
                O haz clic para explorar archivos en tu equipo
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-folder"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById('folder-input').click();
                }}
              >
                <FolderUp size={14} />
                Seleccionar Carpeta
              </button>
            </div>

            <input
              type="file"
              id="file-input"
              multiple
              accept=".pdf,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <input
              type="file"
              id="folder-input"
              webkitdirectory=""
              directory=""
              multiple
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
          </div>

          <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <p>💡 <b>Tip de automatización:</b> Sube los PDFs individuales (originales y duplicados). El sistema los asociará al empleado leyendo su CUIL interno y los clasificará como Original o Duplicado de forma automática.</p>
          </div>
        </div>

        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px' }}>
            <h3 style={{ whiteSpace: 'nowrap' }}>Control de Firmas ({selectedMonth})</h3>
            <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'flex-end' }}>
              <input
                type="text"
                placeholder="Buscar empleado o CUIL..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ maxWidth: '220px', padding: '8px 12px' }}
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ padding: '8px 12px' }}
              >
                <option value="Todos">Todos los estados</option>
                <option value="Cargado">Cargado (Sin enviar)</option>
                <option value="Programado">Programado</option>
                <option value="Enviado">Enviado (Pendiente)</option>
                <option value="Firmado">Firmado</option>
              </select>

              <button
                className="btn btn-primary"
                onClick={() => {
                  const unsentList = filteredPayslips.filter(p => p.status === 'Cargado' && p.employeeId && p.duplicadoPath);
                  if (unsentList.length === 0) {
                    triggerAlert('warning', 'No hay recibos cargados (con empleado asignado y duplicado listo) para enviar o programar.');
                    return;
                  }
                  setSelectedScheduleIds(unsentList.map(p => p.id));
                  setScheduledDateTime('');
                  setShowScheduleModal(true);
                }}
              >
                <Send size={15} style={{ marginRight: '4px' }} />
                Enviar Lote
              </button>

              <a
                href={totalInPeriod > 0 ? `${API_BASE}/api/download-zip/${selectedMonth}` : '#'}
                className={`btn btn-secondary ${signedInPeriod === 0 ? 'disabled' : ''}`}
                style={{ pointerEvents: signedInPeriod === 0 ? 'none' : 'auto', opacity: signedInPeriod === 0 ? 0.5 : 1 }}
                title="Descargar todos los Duplicados Firmados en un ZIP"
              >
                <FileDown size={15} />
                Descargar ZIP
              </a>
              <button
                className="btn btn-secondary"
                style={{ border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => {
                  setAdvancedDeleteConfirmInput('');
                  setSelectedDeletePeriods([]);
                  setSelectedDeleteEmployees([]);
                  setSelectedDeleteStatuses([]);
                  setShowAdvancedDeleteModal(true);
                }}
                title="Borrar recibos de sueldo usando múltiples filtros avanzados"
              >
                <Trash2 size={15} />
                Borrar Lote
              </button>
            </div>
          </div>

          <div className="table-container">
            {filteredPayslips.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                No se encontraron recibos cargados en este período que coincidan con los filtros.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Empleado / CUIL</th>
                    <th>Documentos</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayslips.map((ps) => {
                    const hasOrg = !!ps.originalPath;
                    const hasDup = !!ps.duplicadoPath;
                    const isSigned = ps.status === 'Firmado';

                    return (
                      <tr key={ps.id}>
                        <td>
                          <div style={{ fontWeight: '600' }}>{ps.employeeName || ps.employees?.name || 'Empleado sin asignar'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            CUIL: {ps.employeeCuil || ps.employees?.cuil || ps.detectedCuil || ps.detected_cuil || 'No detectado'}
                          </div>

                          {!ps.employeeId && !ps.employee_id && (
                            <div style={{ marginTop: '6px' }}>
                              <select
                                onChange={(e) => handleMatchManual(ps.id, e.target.value)}
                                style={{ fontSize: '11px', padding: '4px', background: '#2d1e3e', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fda4af' }}
                                defaultValue=""
                              >
                                <option value="" disabled>Asociar empleado manualmente...</option>
                                {employees.map(e => (
                                  <option key={e.id} value={e.id}>{e.name} (CUIL: {e.cuil})</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '12px' }}>
                              📄 Original: {hasOrg ? (
                                <a href={`${API_BASE}/api/download/original/${ps.id}`} style={{ color: 'var(--secondary)', textDecoration: 'none' }} title="Descargar Original">
                                  {ps.originalFilename ? ps.originalFilename.substring(0, 20) + '...' : 'Descargar'} <Download size={10} style={{ display: 'inline' }} />
                                </a>
                              ) : <span style={{ color: 'var(--text-muted)' }}>Falta cargar</span>}
                            </span>
                            <span style={{ fontSize: '12px' }}>
                              📄 Duplicado: {hasDup ? (
                                <a href={`${API_BASE}/api/download/duplicado/${ps.id}`} style={{ color: 'var(--secondary)', textDecoration: 'none' }} title="Descargar Duplicado Base">
                                  {ps.duplicadoFilename ? ps.duplicadoFilename.substring(0, 20) + '...' : 'Descargar'} <Download size={10} style={{ display: 'inline' }} />
                                </a>
                              ) : <span style={{ color: 'var(--text-muted)' }}>Falta cargar</span>}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge badge-${ps.status.toLowerCase()}`}>
                            {ps.status}
                          </span>
                          {ps.status === 'Programado' && ps.scheduledAt && (
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              🕒 {new Date(ps.scheduledAt).toLocaleString()}
                            </div>
                          )}
                          {ps.signedAt && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                              Firmado: {new Date(ps.signedAt).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {hasDup && ps.status === 'Cargado' && (
                              <>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '6px 10px' }}
                                  onClick={() => sendInvitation(ps.id)}
                                  title="Enviar solicitud inmediatamente"
                                  disabled={!ps.employeeId}
                                >
                                  <Mail size={14} />
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '6px 10px' }}
                                  onClick={() => {
                                    setSelectedScheduleIds([ps.id]);
                                    setScheduledDateTime('');
                                    setShowScheduleModal(true);
                                  }}
                                  title="Programar envío por email"
                                  disabled={!ps.employeeId}
                                >
                                  <Calendar size={14} />
                                </button>
                              </>
                            )}

                            {ps.status === 'Programado' && (
                              <button
                                className="btn btn-danger"
                                style={{ padding: '6px 10px' }}
                                onClick={async () => {
                                  if (!window.confirm("¿Deseas cancelar el envío programado?")) return;
                                  try {
                                    const res = await fetch(`${API_BASE}/api/payslips/schedule`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ ids: [ps.id], scheduledAt: null })
                                    });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error);
                                    triggerAlert('success', data.message);
                                    refreshData();
                                  } catch (err) {
                                    triggerAlert('error', err.message);
                                  }
                                }}
                                title="Cancelar envío programado"
                              >
                                <X size={14} />
                              </button>
                            )}

                            {hasDup && ps.status === 'Enviado' && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px' }}
                                onClick={() => sendInvitation(ps.id)}
                                title="Re-enviar recordatorio"
                                disabled={!ps.employeeId}
                              >
                                <Mail size={14} />
                              </button>
                            )}

                            {isSigned && (
                              <a
                                href={`${API_BASE}/api/download/signed/${ps.id}`}
                                className="btn btn-primary"
                                style={{ padding: '6px 10px', background: 'var(--success)', boxShadow: 'none' }}
                                title="Descargar Duplicado Firmado"
                              >
                                <Download size={14} />
                                Firmado
                              </a>
                            )}

                            <button
                              className="btn btn-danger"
                              style={{ padding: '6px 10px' }}
                              onClick={() => deletePayslip(ps.id)}
                              title="Eliminar registro"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Programación de Envío */}
      {showScheduleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ maxWidth: '400px', width: '100%', border: '1px solid var(--border-color)', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px' }}>Programar Envío de Recibos</h3>
              <button className="nav-link" onClick={() => setShowScheduleModal(false)} style={{ padding: '4px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
              Selecciona la fecha y hora. El sistema procesará el envío de los correos automáticamente al cumplirse el plazo.
              {selectedScheduleIds.length > 1 && <span> (Afectará a <b>{selectedScheduleIds.length} recibos</b> seleccionados).</span>}
            </p>

            <div className="form-group">
              <label>Fecha y Hora de Envío (Local)</label>
              <input
                type="datetime-local"
                value={scheduledDateTime}
                onChange={(e) => setScheduledDateTime(e.target.value)}
                required
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  setShowScheduleModal(false);
                  if (selectedScheduleIds.length === 1) {
                    sendInvitation(selectedScheduleIds[0]);
                  } else {
                    handleBulkSend();
                  }
                }}
              >
                Enviar Ahora
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={!scheduledDateTime || isSubmittingSchedule}
                onClick={async () => {
                  setIsSubmittingSchedule(true);
                  try {
                    const res = await fetch(`${API_BASE}/api/payslips/schedule`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ids: selectedScheduleIds,
                        scheduledAt: new Date(scheduledDateTime).toISOString()
                      })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    triggerAlert('success', data.message);
                    setShowScheduleModal(false);
                    refreshData();
                  } catch (err) {
                    triggerAlert('error', err.message);
                  } finally {
                    setIsSubmittingSchedule(false);
                  }
                }}
              >
                Programar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Autodetección de Períodos */}
      {showAutoDetectModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ maxWidth: '450px', width: '100%', border: '1px solid var(--border-color)', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px' }}>¿Usar autodetección de períodos?</h3>
              <button className="nav-link" onClick={() => { setShowAutoDetectModal(false); setPendingUploadFiles([]); }} style={{ padding: '4px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              Hemos detectado que algunos de los archivos seleccionados contienen un período de liquidación en su nombre (ej. <b>"2026-04"</b>).
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
              ¿Deseas clasificar automáticamente cada recibo en el período detectado de su nombre de archivo, o prefieres asignarlos todos al período seleccionado manualmente (<b>{selectedMonth}</b>)?
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  setShowAutoDetectModal(false);
                  checkForConflicts(pendingUploadFiles, false);
                }}
              >
                No, usar manual ({selectedMonth})
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  setShowAutoDetectModal(false);
                  checkForConflicts(pendingUploadFiles, true);
                }}
              >
                Sí, autodetectar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reporte de Subida Final */}
      {showSummaryModal && uploadSummary && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '450px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--border-color)',
            padding: '28px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
              <h3 style={{ fontSize: '18px' }}>Informe de Subida Finalizado</h3>
              <button className="nav-link" onClick={() => setShowSummaryModal(false)} style={{ padding: '4px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', marginBottom: '20px' }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div className="stat-icon success" style={{ margin: '0 auto 12px auto', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle size={32} style={{ color: 'var(--success)' }} />
                </div>
                <h4 style={{ fontSize: '16px', color: '#fff' }}>Procesamiento de Lote Completo</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Se procesaron exitosamente <b>{uploadSummary.successCount}</b> de <b>{uploadSummary.total}</b> archivos recibidos.
                </p>
                {uploadSummary.skippedCount > 0 && (
                  <p style={{ fontSize: '13px', color: '#6ee7b7', marginTop: '4px', fontWeight: 'bold' }}>
                    💡 Se omitieron <b>{uploadSummary.skippedCount}</b> archivos por existir previamente.
                  </p>
                )}
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '16px' }}>
                <h5 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '0.05em' }}>Resumen por Período:</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.keys(uploadSummary.periods).length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Ningún recibo subido exitosamente.</div>
                  ) : (
                    Object.entries(uploadSummary.periods).map(([month, count]) => (
                      <div key={month} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-primary)' }}>
                        <span>Período <b>{month}</b>:</span>
                        <span><b>{count}</b> recibo{count > 1 ? 's' : ''}</span>
                      </div>
                    ))
                  )}
                </div>

                {uploadSummary.failCount > 0 && (
                  <>
                    <hr style={{ border: 0, borderTop: '1px solid var(--border-color)', margin: '12px 0' }} />
                    <h5 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--danger)', marginBottom: '8px', letterSpacing: '0.05em' }}>Errores ({uploadSummary.failCount}):</h5>
                    <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: '#fda4af' }}>
                      {uploadSummary.errors.map((err, idx) => (
                        <div key={idx} style={{ wordBreak: 'break-all' }}>• {err}</div>
                      ))}
                    </div>
                  </>
                )}

                {uploadSummary.warnings && uploadSummary.warnings.length > 0 && (
                  <>
                    <hr style={{ border: 0, borderTop: '1px solid var(--border-color)', margin: '12px 0' }} />
                    <h5 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--warning)', marginBottom: '8px', letterSpacing: '0.05em' }}>Advertencias ({uploadSummary.warnings.length}):</h5>
                    <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: '#fde047' }}>
                      {uploadSummary.warnings.map((warn, idx) => (
                        <div key={idx} style={{ wordBreak: 'break-all' }}>⚠️ {warn}</div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', flexShrink: 0 }}
              onClick={() => setShowSummaryModal(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal de Conflictos de Períodos */}
      {showConflictModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{ maxWidth: '480px', width: '100%', border: '1px solid var(--border-color)', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} style={{ color: 'var(--warning)' }} />
                Recibos Existentes Detectados
              </h3>
              <button
                className="nav-link"
                onClick={() => { setShowConflictModal(false); setPendingUploadFiles([]); }}
                style={{ padding: '4px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              Se detectaron recibos de sueldo previamente cargados para el/los período(s): <b>{conflictPeriods.join(', ')}</b>.
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
              ¿Qué acción desea tomar para los recibos que ya existen?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={() => {
                  setShowConflictModal(false);
                  executeUploads(pendingUploadFiles, uploadOptions.useAutoDetect, 'true');
                }}
              >
                <RefreshCw size={14} />
                Sobrescribir existentes
              </button>
              <button
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={() => {
                  setShowConflictModal(false);
                  executeUploads(pendingUploadFiles, uploadOptions.useAutoDetect, 'false');
                }}
              >
                <Eye size={14} />
                Omitir existentes (mantener actuales)
              </button>
              <button
                className="btn btn-secondary"
                style={{ border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fda4af' }}
                onClick={() => {
                  setShowConflictModal(false);
                  setPendingUploadFiles([]);
                }}
              >
                Cancelar subida
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Borrado Masivo Avanzado */}
      {showAdvancedDeleteModal && (() => {
        const allUniquePeriods = [...new Set(payslips.map(p => p.month))].sort().reverse();
        const matched = getMatchingDeletePayslips();
        const allStatuses = ['Cargado', 'Programado', 'Enviado', 'Firmado'];

        const handleSelectAllPeriods = (select) => {
          setSelectedDeletePeriods(select ? allUniquePeriods : []);
        };

        const handleSelectAllEmployees = (select) => {
          const allEmpIds = [...employees.map(e => e.id), 'unassigned'];
          setSelectedDeleteEmployees(select ? allEmpIds : []);
        };

        const handleSelectAllStatuses = (select) => {
          setSelectedDeleteStatuses(select ? allStatuses : []);
        };

        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px'
          }}>
            <div className="glass-panel" style={{
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '28px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
                <h3 style={{ fontSize: '20px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={24} />
                  Borrado Masivo Avanzado
                </h3>
                <button
                  className="nav-link"
                  onClick={() => setShowAdvancedDeleteModal(false)}
                  style={{ padding: '4px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ overflowY: 'auto', flex: 1, paddingRight: '10px', marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
                  Seleccione los filtros para buscar y eliminar recibos en lote. Se cruzará la información de los tres grupos.
                </p>

                {/* Grid de 3 Columnas para Filtros */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>

                  {/* Columna Períodos */}
                  <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Períodos ({allUniquePeriods.length})</span>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
                        <span style={{ cursor: 'pointer', color: 'var(--secondary)' }} onClick={() => handleSelectAllPeriods(true)}>Todos</span>
                        <span style={{ color: 'var(--text-muted)' }}>|</span>
                        <span style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => handleSelectAllPeriods(false)}>Ninguno</span>
                      </div>
                    </div>
                    <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                      {allUniquePeriods.length === 0 ? (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No hay períodos cargados</div>
                      ) : (
                        allUniquePeriods.map(m => (
                          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selectedDeletePeriods.includes(m)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDeletePeriods(prev => [...prev, m]);
                                } else {
                                  setSelectedDeletePeriods(prev => prev.filter(x => x !== m));
                                }
                              }}
                            />
                            {m}
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Columna Empleados */}
                  <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Empleados ({employees.length + 1})</span>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
                        <span style={{ cursor: 'pointer', color: 'var(--secondary)' }} onClick={() => handleSelectAllEmployees(true)}>Todos</span>
                        <span style={{ color: 'var(--text-muted)' }}>|</span>
                        <span style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => handleSelectAllEmployees(false)}>Ninguno</span>
                      </div>
                    </div>
                    <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: '#fda4af', fontWeight: '500' }}>
                        <input
                          type="checkbox"
                          checked={selectedDeleteEmployees.includes('unassigned')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDeleteEmployees(prev => [...prev, 'unassigned']);
                            } else {
                              setSelectedDeleteEmployees(prev => prev.filter(x => x !== 'unassigned'));
                            }
                          }}
                        />
                        Sin asignar (Desconocido)
                      </label>
                      {employees.map(e => (
                        <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selectedDeleteEmployees.includes(e.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDeleteEmployees(prev => [...prev, e.id]);
                              } else {
                                setSelectedDeleteEmployees(prev => prev.filter(x => x !== e.id));
                              }
                            }}
                          />
                          {e.name}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Columna Estados */}
                  <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Estados ({allStatuses.length})</span>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
                        <span style={{ cursor: 'pointer', color: 'var(--secondary)' }} onClick={() => handleSelectAllStatuses(true)}>Todos</span>
                        <span style={{ color: 'var(--text-muted)' }}>|</span>
                        <span style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => handleSelectAllStatuses(false)}>Ninguno</span>
                      </div>
                    </div>
                    <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                      {allStatuses.map(s => (
                        <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selectedDeleteStatuses.includes(s)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDeleteStatuses(prev => [...prev, s]);
                              } else {
                                setSelectedDeleteStatuses(prev => prev.filter(x => x !== s));
                              }
                            }}
                          />
                          {s}
                        </label>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Resumen de impacto y advertencia */}
                <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Recibos que coinciden para eliminar:</span>
                    <span style={{ fontSize: '18px', fontWeight: '800', color: matched.length > 0 ? '#f87171' : 'var(--text-muted)' }}>
                      {matched.length} recibos
                    </span>
                  </div>
                  {matched.length > 0 && (
                    <p style={{ fontSize: '11px', color: '#fda4af', margin: 0 }}>
                      ⚠️ ATENCIÓN: Esta acción borrará de forma permanente los registros y los archivos PDFs del servidor de todos los recibos seleccionados.
                    </p>
                  )}
                </div>

                {/* Input de confirmación */}
                {matched.length > 0 && (
                  <div className="form-group" style={{ marginBottom: '8px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Para confirmar, escriba la palabra <b>ELIMINAR</b> en mayúsculas:
                    </label>
                    <input
                      type="text"
                      value={advancedDeleteConfirmInput}
                      onChange={(e) => setAdvancedDeleteConfirmInput(e.target.value)}
                      placeholder="Escriba ELIMINAR"
                      style={{
                        width: '100%',
                        marginTop: '8px',
                        borderColor: advancedDeleteConfirmInput === 'ELIMINAR' ? 'var(--danger)' : 'var(--border-color)',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        letterSpacing: '0.1em'
                      }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowAdvancedDeleteModal(false)}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-danger"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  disabled={matched.length === 0 || advancedDeleteConfirmInput !== 'ELIMINAR'}
                  onClick={async () => {
                    setShowAdvancedDeleteModal(false);
                    await handleBulkDelete();
                  }}
                >
                  <Trash2 size={14} />
                  Borrar Lote Seleccionado
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
