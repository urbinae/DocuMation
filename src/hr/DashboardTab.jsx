import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Users, Settings, Upload, CheckCircle,
  Clock, Mail, Download, Trash2, Send, Plus,
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5173' : '';

export default function DashboardTab({ payslips, employees, refreshData, triggerAlert }) {
  const [selectedMonth, setSelectedMonth] = useState('');

  const payslipsList = Array.isArray(payslips) ? payslips : [];
  const employeesList = Array.isArray(employees) ? employees : [];

  // Obtener meses únicos presentes ordenados desc
  const months = [...new Set(payslipsList.map(p => p.month).filter(Boolean))].sort().reverse();

  useEffect(() => {
    if (!selectedMonth && months.length > 0) {
      setSelectedMonth(months[0]);
    } else if (!selectedMonth) {
      const d = new Date();
      const currentMonthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(currentMonthStr);
    }
  }, [months, selectedMonth]);

  // Filtrados por mes activo
  const monthlyPayslips = payslipsList.filter(p => p.month === selectedMonth);
  const totalPayslips = monthlyPayslips.length;
  const signedPayslips = monthlyPayslips.filter(p => p.status === 'Firmado' || p.status === 'firmado').length;
  const pendingPayslips = monthlyPayslips.filter(p => p.status === 'Enviado' || p.status === 'pendiente').length;
  const scheduledPayslips = monthlyPayslips.filter(p => p.status === 'Programado').length;
  const uploadedPayslips = monthlyPayslips.filter(p => p.status === 'Cargado').length;

  const totalEmployees = employeesList.length;
  const conformityRate = totalPayslips > 0 ? Math.round((signedPayslips / totalPayslips) * 100) : 0;

  // Cobertura del lote: cuántos empleados del total tienen al menos un recibo (original o duplicado) cargado en el mes
  const employeesWithPayslip = new Set(monthlyPayslips.filter(p => p.employeeId || p.employee_id).map(p => p.employeeId || p.employee_id));
  const missingEmployees = employeesList.filter(e => !employeesWithPayslip.has(e.id));
  const coverageRate = totalEmployees > 0 ? Math.round((employeesWithPayslip.size / totalEmployees) * 100) : 0;

  // Calcular tiempo promedio de firma
  let averageTimeStr = 'N/A';
  const signedWithDates = payslips.filter(p => p.status === 'Firmado' && p.sentAt && p.signedAt);
  if (signedWithDates.length > 0) {
    const totalMs = signedWithDates.reduce((acc, p) => {
      const diff = new Date(p.signedAt) - new Date(p.sentAt);
      return acc + diff;
    }, 0);
    const avgMs = totalMs / signedWithDates.length;
    const avgHours = avgMs / (1000 * 60 * 60);
    if (avgHours < 24) {
      averageTimeStr = `${avgHours.toFixed(1)} hs`;
    } else {
      averageTimeStr = `${(avgHours / 24).toFixed(1)} días`;
    }
  }

  // Recordatorio individual de firma
  const sendReminder = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/payslips/send/${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar email');
      triggerAlert('success', 'Email de recordatorio enviado exitosamente.');
      refreshData();
    } catch (e) {
      triggerAlert('error', e.message);
    }
  };

  // Re-enviar recordatorios en lote a todos los pendientes del mes
  const handleBulkReminder = async () => {
    const pendingList = monthlyPayslips.filter(p => p.status === 'Enviado' && p.employeeId);
    if (pendingList.length === 0) {
      triggerAlert('warning', 'No hay recibos pendientes de firma en este período.');
      return;
    }

    if (!window.confirm(`¿Deseas re-enviar recordatorios de firma por email a ${pendingList.length} empleados?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/payslips/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: pendingList.map(p => p.id) })
      });
      const data = await res.json();
      triggerAlert('success', 'Recordatorios masivos enviados con éxito.');
      refreshData();
    } catch (e) {
      triggerAlert('error', e.message);
    }
  };

  // Listado de pendientes críticos
  const criticalList = monthlyPayslips
    .filter(p => p.status === 'Enviado' && p.sentAt)
    .map(ps => {
      const sentDate = new Date(ps.sentAt);
      const diffTime = Math.abs(new Date() - sentDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { ...ps, elapsedDays: diffDays };
    })
    .sort((a, b) => b.elapsedDays - a.elapsedDays);

  // --- Datos del Histórico de 6 meses ---
  const last6Months = (() => {
    const result = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const tempDate = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const mStr = `${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, '0')}`;
      result.push(mStr);
    }
    return result;
  })();

  const barChartData = last6Months.map(m => {
    const monthPayslips = payslips.filter(p => p.month === m);
    const signed = monthPayslips.filter(p => p.status === 'Firmado').length;
    const pending = monthPayslips.length - signed;
    return {
      month: m,
      signed,
      pending,
      total: monthPayslips.length
    };
  });

  const maxVal = Math.max(...barChartData.map(d => d.total), 5);

  // --- Datos del Donut del Mes Seleccionado ---
  const perimeter = 314.16;
  const pSigned = totalPayslips > 0 ? signedPayslips / totalPayslips : 0;
  const pSent = totalPayslips > 0 ? pendingPayslips / totalPayslips : 0;
  const pScheduled = totalPayslips > 0 ? scheduledPayslips / totalPayslips : 0;
  const pUploaded = totalPayslips > 0 ? uploadedPayslips / totalPayslips : 0;

  const signedLength = pSigned * perimeter;
  const sentLength = pSent * perimeter;
  const scheduledLength = pScheduled * perimeter;
  const uploadedLength = pUploaded * perimeter;

  return (
    <div>
      {/* Selector de Período y Botón Masivo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Dashboard de Control y KPIs</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Métricas clave, tasas de firma y seguimiento en tiempo real.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="form-group" style={{ marginBottom: 0, flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
            <label style={{ whiteSpace: 'nowrap' }}>Período:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: '8px 12px' }}
            />
          </div>
          <button className="btn btn-secondary" onClick={handleBulkReminder} disabled={pendingPayslips === 0}>
            <Send size={14} style={{ marginRight: '4px' }} />
            Recordatorio Masivo ({pendingPayslips})
          </button>
        </div>
      </div>

      {/* Grid de KPIs */}
      <div className="dashboard-grid" style={{ marginBottom: '32px' }}>
        <div className="glass-panel stat-card">
          <div className="stat-icon primary"><Users size={24} /></div>
          <div className="stat-info">
            <h3>{totalEmployees}</h3>
            <p>Empleados Totales</p>
          </div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-icon success"><CheckCircle size={24} /></div>
          <div className="stat-info">
            <h3>{conformityRate}%</h3>
            <p>Tasa Conformidad ({signedPayslips}/{totalPayslips})</p>
          </div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-icon warning"><Clock size={24} /></div>
          <div className="stat-info">
            <h3>{pendingPayslips}</h3>
            <p>Pendientes de Firma</p>
          </div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-icon secondary"><Mail size={24} /></div>
          <div className="stat-info">
            <h3>{uploadedPayslips}</h3>
            <p>Sin Notificar (Cargados)</p>
            {scheduledPayslips > 0 && (
              <span style={{ fontSize: '11px', color: '#a78bfa', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={11} /> {scheduledPayslips} Programados
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Grid de Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '24px', marginBottom: '32px' }} className="kpi-charts-grid">
        {/* Histórico 6 Meses */}
        <div className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px' }}>Histórico de Firmas (Últimos 6 Meses)</h3>
            <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--success)' }}></span>
                Firmados
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--primary)' }}></span>
                Pendientes
              </span>
            </div>
          </div>

          <div className="chart-container" style={{ width: '100%', height: '220px', display: 'flex', alignItems: 'flex-end' }}>
            <svg viewBox="0 0 550 200" width="100%" height="100%">
              {/* Grid Lines */}
              <line x1="40" y1="30" x2="530" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
              <line x1="40" y1="80" x2="530" y2="80" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
              <line x1="40" y1="130" x2="530" y2="130" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
              <line x1="40" y1="170" x2="530" y2="170" stroke="rgba(255,255,255,0.1)" />

              {/* Y Axis Labels */}
              <text x="30" y="34" fill="var(--text-muted)" fontSize="10" textAnchor="end">{maxVal}</text>
              <text x="30" y="84" fill="var(--text-muted)" fontSize="10" textAnchor="end">{Math.round(maxVal * 0.66)}</text>
              <text x="30" y="134" fill="var(--text-muted)" fontSize="10" textAnchor="end">{Math.round(maxVal * 0.33)}</text>
              <text x="30" y="174" fill="var(--text-muted)" fontSize="10" textAnchor="end">0</text>

              {/* Bars */}
              {barChartData.map((d, index) => {
                const barWidth = 32;
                const colWidth = 75;
                const x = 50 + index * colWidth;

                const signedHeight = d.signed > 0 ? (d.signed / maxVal) * 140 : 0;
                const pendingHeight = d.pending > 0 ? (d.pending / maxVal) * 140 : 0;

                const ySigned = 170 - signedHeight;
                const yPending = ySigned - pendingHeight;

                return (
                  <g key={d.month} className="bar-group">
                    <title>{`Mes: ${d.month}\nFirmados: ${d.signed}\nPendientes: ${d.pending}\nTotal: ${d.total}`}</title>

                    {/* Bar signed */}
                    {d.signed > 0 && (
                      <rect
                        x={x}
                        y={ySigned}
                        width={barWidth}
                        height={signedHeight}
                        fill="var(--success)"
                        opacity="0.85"
                        rx="2"
                      />
                    )}
                    {/* Bar pending */}
                    {d.pending > 0 && (
                      <rect
                        x={x}
                        y={yPending}
                        width={barWidth}
                        height={pendingHeight}
                        fill="var(--primary)"
                        opacity="0.85"
                        rx="2"
                      />
                    )}

                    {/* Month Label */}
                    <text
                      x={x + barWidth / 2}
                      y="190"
                      fill="var(--text-secondary)"
                      fontSize="10"
                      textAnchor="middle"
                    >
                      {d.month.split('-')[1] + '/' + d.month.split('-')[0].substring(2)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Distribución del mes (Dona) */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Estado del Lote ({selectedMonth})</h3>

          {totalPayslips === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0' }}>
              <AlertTriangle size={32} style={{ marginBottom: '8px' }} />
              <span>Sin recibos cargados en este período.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1, padding: '10px 0' }}>
              {/* Dona SVG */}
              <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
                <svg width="100%" height="100%" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />

                  {/* Firmados */}
                  {signedLength > 0 && (
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="var(--success)"
                      strokeWidth="12"
                      strokeDasharray={`${signedLength} ${perimeter - signedLength}`}
                      strokeDashoffset="0"
                    />
                  )}
                  {/* Enviados */}
                  {sentLength > 0 && (
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="var(--warning)"
                      strokeWidth="12"
                      strokeDasharray={`${sentLength} ${perimeter - sentLength}`}
                      strokeDashoffset={`-${signedLength}`}
                    />
                  )}
                  {/* Programados */}
                  {scheduledLength > 0 && (
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="12"
                      strokeDasharray={`${scheduledLength} ${perimeter - scheduledLength}`}
                      strokeDashoffset={`-${signedLength + sentLength}`}
                    />
                  )}
                  {/* Cargados */}
                  {uploadedLength > 0 && (
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="var(--secondary)"
                      strokeWidth="12"
                      strokeDasharray={`${uploadedLength} ${perimeter - uploadedLength}`}
                      strokeDashoffset={`-${signedLength + sentLength + scheduledLength}`}
                    />
                  )}
                </svg>
                {/* Texto Central */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>{conformityRate}%</div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Firma</div>
                </div>
              </div>

              {/* Leyenda */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></span>
                    Firmado
                  </span>
                  <b>{signedPayslips} ({Math.round(pSigned * 100)}%)</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--warning)' }}></span>
                    Enviado
                  </span>
                  <b>{pendingPayslips} ({Math.round(pSent * 100)}%)</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6' }}></span>
                    Programado
                  </span>
                  <b>{scheduledPayslips} ({Math.round(pScheduled * 100)}%)</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--secondary)' }}></span>
                    Cargado
                  </span>
                  <b>{uploadedPayslips} ({Math.round(pUploaded * 100)}%)</b>
                </div>
                <hr style={{ border: 0, borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>Total Recibos</span>
                  <b>{totalPayslips} uds.</b>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fila de Alertas y Pendientes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="kpi-bottom-grid">
        {/* Alertas de Cobertura y Tiempos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Tarjeta de Tiempos */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className="stat-icon success" style={{ width: '48px', height: '48px' }}><TrendingUp size={22} /></div>
              <div>
                <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Tiempo Medio de Respuesta</h4>
                <h3 style={{ fontSize: '24px', marginTop: '2px' }}>{averageTimeStr}</h3>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Transcurrido desde el email hasta la firma de conformidad.</p>
              </div>
            </div>
          </div>

          {/* Tarjeta Alerta Nómina Incompleta */}
          <div className="glass-panel" style={{ flex: 1, padding: '20px' }}>
            <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <AlertTriangle size={18} style={{ color: missingEmployees.length > 0 ? 'var(--warning)' : 'var(--success)' }} />
              Auditoría de Carga (Cobertura: {coverageRate}%)
            </h3>

            {missingEmployees.length === 0 ? (
              <div style={{ color: 'var(--success)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.05)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                <span>✔ <b>¡Excelente!</b> Todos los empleados registrados ({totalEmployees}) tienen al menos un recibo cargado para el mes de {selectedMonth}.</span>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '13px', marginBottom: '12px', color: 'var(--text-secondary)' }}>
                  ⚠️ Se detectaron <b>{missingEmployees.length} empleados</b> que no figuran en los recibos de {selectedMonth}:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '100px', overflowY: 'auto', paddingRight: '4px' }}>
                  {missingEmployees.map(emp => (
                    <span
                      key={emp.id}
                      style={{
                        fontSize: '11px',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.15)',
                        color: '#fef08a'
                      }}
                      title={`CUIL: ${emp.cuil}`}
                    >
                      {emp.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pendientes Críticos */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Recordatorios Pendientes (Urgentes)</h3>

          <div className="table-container" style={{ flex: 1, maxHeight: '200px', overflowY: 'auto' }}>
            {criticalList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No hay firmas pendientes para este mes. ¡Todo al día!
              </div>
            ) : (
              <table style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Empleado</th>
                    <th style={{ textAlign: 'center' }}>Demora</th>
                    <th style={{ textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalList.slice(0, 5).map(ps => (
                    <tr key={ps.id}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: '600' }}>{ps.employeeName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>CUIL: {ps.employeeCuil}</div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 'bold',
                          color: ps.elapsedDays > 3 ? 'var(--danger)' : 'var(--warning)',
                          background: ps.elapsedDays > 3 ? 'var(--danger-glow)' : 'var(--warning-glow)',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          {ps.elapsedDays === 1 ? 'Hace 1 día' : `Hace ${ps.elapsedDays} días`}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                          onClick={() => sendReminder(ps.id)}
                          title="Enviar mail de recordatorio individual"
                        >
                          <Mail size={12} style={{ marginRight: '4px' }} />
                          Re-enviar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {criticalList.length > 5 && (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
              * Se muestran los 5 casos más antiguos de un total de {criticalList.length} pendientes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
