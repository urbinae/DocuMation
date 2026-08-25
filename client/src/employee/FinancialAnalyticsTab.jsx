import React from 'react';
import { TrendingUp, DollarSign, Activity } from 'lucide-react';

export default function FinancialAnalyticsTab({ payslips }) {
  if (!payslips || payslips.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
        No hay datos suficientes para mostrar estadísticas.
      </div>
    );
  }

  // Ordenar por fecha o periodo si es posible (asumimos que month tiene formato año-mes o similar, pero lo mostramos tal cual)
  const sortedPayslips = [...payslips].reverse(); // Asumiendo que vienen ordenados del más nuevo al más viejo

  // Calculamos promedios
  let totalNeto = 0;
  let totalBruto = 0;
  let count = 0;

  sortedPayslips.forEach(ps => {
    if (ps.netPay || ps.grossPay) {
      totalNeto += ps.netPay || 0;
      totalBruto += ps.grossPay || 0;
      count++;
    }
  });

  const avgNeto = count > 0 ? (totalNeto / count).toFixed(2) : 0;
  const avgBruto = count > 0 ? (totalBruto / count).toFixed(2) : 0;

  return (
    <div className="glass-panel">
      <h2><TrendingUp size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Análisis Financiero</h2>
      <p style={{ fontSize: '14px', marginBottom: '24px' }}>
        Resumen de la evolución de tus remuneraciones netas y brutas a lo largo de los períodos liquidados.
      </p>

      {count > 0 && (
        <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '24px' }}>
          <div className="glass-panel stat-card">
            <div className="stat-icon success"><DollarSign size={20} /></div>
            <div className="stat-info">
              <h3 style={{ fontSize: '20px' }}>${avgNeto}</h3>
              <p style={{ fontSize: '11px' }}>Neto Promedio</p>
            </div>
          </div>
          <div className="glass-panel stat-card">
            <div className="stat-icon primary"><Activity size={20} /></div>
            <div className="stat-info">
              <h3 style={{ fontSize: '20px' }}>${avgBruto}</h3>
              <p style={{ fontSize: '11px' }}>Bruto Promedio</p>
            </div>
          </div>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Período</th>
              <th>Sueldo Bruto</th>
              <th>Sueldo Neto</th>
              <th>Diferencia (Deducciones)</th>
            </tr>
          </thead>
          <tbody>
            {sortedPayslips.map(ps => {
              const bruto = ps.grossPay || 0;
              const neto = ps.netPay || 0;
              const deducciones = bruto - neto;
              
              return (
                <tr key={ps.id}>
                  <td style={{ fontWeight: '600' }}>{ps.month}</td>
                  <td>{bruto > 0 ? `$${bruto.toFixed(2)}` : '-'}</td>
                  <td style={{ color: 'var(--success)' }}>{neto > 0 ? `$${neto.toFixed(2)}` : '-'}</td>
                  <td style={{ color: 'var(--danger)' }}>{deducciones > 0 ? `$${deducciones.toFixed(2)}` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
