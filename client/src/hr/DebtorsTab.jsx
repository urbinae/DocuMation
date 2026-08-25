import React, { useState } from 'react';
import { Users, Mail, AlertTriangle, Send, CheckCircle } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

export default function DebtorsTab({ payslips, employees, refreshData, triggerAlert }) {
  const [isSending, setIsSending] = useState(false);

  // Filtrar solo los enviados que no han sido firmados
  const sentPayslips = payslips.filter(p => p.status === 'Enviado');

  // Agrupar por empleado
  const groupedDebtors = {};
  sentPayslips.forEach(p => {
    if (!groupedDebtors[p.employeeId]) {
      const emp = employees.find(e => e.id === p.employeeId);
      groupedDebtors[p.employeeId] = {
        employeeId: p.employeeId,
        name: emp ? emp.name : p.employeeName || 'Desconocido',
        cuil: emp ? emp.cuil : p.employeeCuil || 'N/A',
        payslips: [],
        totalDelayDays: 0
      };
    }
    
    // Calcular días de atraso
    let delayDays = 0;
    if (p.sentAt) {
      const sentDate = new Date(p.sentAt);
      const now = new Date();
      delayDays = Math.floor((now - sentDate) / (1000 * 60 * 60 * 24));
    }
    
    groupedDebtors[p.employeeId].payslips.push({ ...p, delayDays });
    groupedDebtors[p.employeeId].totalDelayDays += delayDays;
  });

  const debtorsList = Object.values(groupedDebtors).map(d => ({
    ...d,
    avgDelay: d.payslips.length > 0 ? Math.round(d.totalDelayDays / d.payslips.length) : 0
  })).sort((a, b) => b.avgDelay - a.avgDelay);

  const handleSendReminder = async (employeeId) => {
    const debtor = groupedDebtors[employeeId];
    if (!debtor) return;
    
    setIsSending(true);
    try {
      const ids = debtor.payslips.map(p => p.id);
      const res = await fetch(`${API_BASE}/api/payslips/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar recordatorios');
      triggerAlert('success', `Recordatorios enviados a ${debtor.name}`);
      refreshData();
    } catch (e) {
      triggerAlert('error', e.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', gap: '10px' }}>
        <AlertTriangle color="var(--warning)" size={24} />
        <h3 style={{ margin: 0 }}>Empleados Deudores de Firma</h3>
      </div>
      
      <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Esta pestaña muestra a los empleados que tienen recibos enviados pero aún no los han firmado.
      </p>

      {debtorsList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <CheckCircle size={48} style={{ marginBottom: '10px', color: 'var(--success)' }} />
          <p>¡Excelente! No hay firmas atrasadas.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>CUIL</th>
                <th>Recibos Pendientes</th>
                <th>Atraso Promedio</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {debtorsList.map(debtor => (
                <tr key={debtor.employeeId}>
                  <td style={{ fontWeight: '600' }}>{debtor.name}</td>
                  <td>{debtor.cuil}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {debtor.payslips.map(p => (
                        <span key={p.id} style={{
                          background: 'rgba(255,255,255,0.05)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                          {p.month}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span style={{ 
                      color: debtor.avgDelay > 7 ? 'var(--danger)' : debtor.avgDelay > 3 ? 'var(--warning)' : 'var(--text-primary)',
                      fontWeight: debtor.avgDelay > 3 ? 'bold' : 'normal'
                    }}>
                      {debtor.avgDelay} días
                    </span>
                  </td>
                  <td>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => handleSendReminder(debtor.employeeId)}
                      disabled={isSending}
                    >
                      <Send size={14} /> Reenviar Todo
                    </button>
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
