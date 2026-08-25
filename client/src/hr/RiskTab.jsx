import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Download, Search, ShieldAlert } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

export default function RiskTab({ payslips, employees }) {
  const [thresholds, setThresholds] = useState({
    riskThresholdSeconds: 120,
    riskThresholdDownloads: 2
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/settings`);
        const data = await res.json();
        setThresholds({
          riskThresholdSeconds: data.riskThresholdSeconds || 120,
          riskThresholdDownloads: data.riskThresholdDownloads || 2
        });
      } catch (e) {
        console.error("Error al obtener umbrales de riesgo", e);
      }
    };
    fetchSettings();
  }, []);

  // Filtrar y analizar empleados con comportamientos anómalos
  const riskCases = [];

  payslips.forEach(p => {
    if (p.analytics) {
      const timeSpent = p.analytics.timeSpentSeconds || 0;
      const downloads = p.analytics.downloadCount || 0;

      const isTimeAnomalous = timeSpent > thresholds.riskThresholdSeconds;
      const isDownloadAnomalous = downloads > thresholds.riskThresholdDownloads;

      if (isTimeAnomalous || isDownloadAnomalous) {
        const emp = employees.find(e => e.id === p.employeeId);
        riskCases.push({
          payslipId: p.id,
          month: p.month,
          employeeName: emp ? emp.name : p.employeeName || 'Desconocido',
          employeeCuil: emp ? emp.cuil : p.employeeCuil || 'N/A',
          timeSpent,
          downloads,
          isTimeAnomalous,
          isDownloadAnomalous
        });
      }
    }
  });

  // Ordenar por severidad (ambas anomalías primero, luego descargas, luego tiempo)
  riskCases.sort((a, b) => {
    const scoreA = (a.isTimeAnomalous ? 1 : 0) + (a.isDownloadAnomalous ? 2 : 0);
    const scoreB = (b.isTimeAnomalous ? 1 : 0) + (b.isDownloadAnomalous ? 2 : 0);
    return scoreB - scoreA;
  });

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', gap: '10px' }}>
        <ShieldAlert color="var(--danger)" size={24} />
        <h3 style={{ margin: 0 }}>Panel de Riesgo de Fuga</h3>
      </div>
      
      <div style={{ marginBottom: '24px', display: 'flex', gap: '20px' }}>
        <div style={{ background: 'rgba(255, 112, 67, 0.1)', padding: '16px', borderRadius: '8px', flex: 1, border: '1px solid rgba(255, 112, 67, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', marginBottom: '8px' }}>
            <Clock size={18} />
            <strong style={{ fontSize: '14px' }}>Umbral de Tiempo</strong>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Se alerta si el empleado pasa más de <b>{thresholds.riskThresholdSeconds} segundos</b> leyendo el borrador del recibo antes de firmar, lo que indica un escrutinio inusual.
          </p>
        </div>
        <div style={{ background: 'rgba(255, 112, 67, 0.1)', padding: '16px', borderRadius: '8px', flex: 1, border: '1px solid rgba(255, 112, 67, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', marginBottom: '8px' }}>
            <Download size={18} />
            <strong style={{ fontSize: '14px' }}>Umbral de Descargas</strong>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Se alerta si el empleado descarga el borrador del recibo más de <b>{thresholds.riskThresholdDownloads} veces</b>, lo que podría indicar envío a revisión externa (ej. abogado).
          </p>
        </div>
      </div>

      {riskCases.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <ShieldAlert size={48} style={{ marginBottom: '10px', color: 'var(--success)' }} />
          <p>No se han detectado comportamientos anómalos recientemente.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>CUIL</th>
                <th>Período</th>
                <th>Tiempo Lectura</th>
                <th>Descargas Borrador</th>
                <th>Nivel de Alerta</th>
              </tr>
            </thead>
            <tbody>
              {riskCases.map((rc, idx) => (
                <tr key={`${rc.payslipId}-${idx}`} style={{ background: rc.isTimeAnomalous && rc.isDownloadAnomalous ? 'rgba(255,0,0,0.05)' : 'transparent' }}>
                  <td style={{ fontWeight: '600' }}>{rc.employeeName}</td>
                  <td>{rc.employeeCuil}</td>
                  <td>{rc.month}</td>
                  <td>
                    {rc.isTimeAnomalous ? (
                      <span style={{ color: 'var(--danger)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={14} /> {rc.timeSpent} s
                      </span>
                    ) : (
                      <span>{rc.timeSpent} s</span>
                    )}
                  </td>
                  <td>
                    {rc.isDownloadAnomalous ? (
                      <span style={{ color: 'var(--danger)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={14} /> {rc.downloads}
                      </span>
                    ) : (
                      <span>{rc.downloads}</span>
                    )}
                  </td>
                  <td>
                    {rc.isTimeAnomalous && rc.isDownloadAnomalous ? (
                      <span style={{ background: 'var(--danger)', color: '#fff', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>Alta (Posible Fuga)</span>
                    ) : (
                      <span style={{ background: 'var(--warning)', color: '#000', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>Media (Escrutinio)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
