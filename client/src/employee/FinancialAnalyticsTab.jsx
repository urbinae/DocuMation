import React from 'react';
import { TrendingUp, DollarSign, Activity } from 'lucide-react';

/**
 * Extrae los montos financieros de un recibo.
 * El backend guarda los importes en ps.financial_data (snake_case, campo JSONB),
 * que el helper enrichPayslipWithUrls mapea a ps.financialData (camelCase).
 * También se acepta grossPay/netPay directamente en el objeto por compatibilidad.
 */
function getAmounts(ps) {
  // Primero intentamos financialData (camelCase, vía enrichPayslipWithUrls)
  const fd = ps.financialData || ps.financial_data || null;
  const grossPay =
    (fd && typeof fd.grossPay === 'number' ? fd.grossPay : 0) ||
    (fd && typeof fd.gross_pay === 'number' ? fd.gross_pay : 0) ||
    (typeof ps.grossPay === 'number' ? ps.grossPay : 0);
  const netPay =
    (fd && typeof fd.netPay === 'number' ? fd.netPay : 0) ||
    (fd && typeof fd.net_pay === 'number' ? fd.net_pay : 0) ||
    (typeof ps.netPay === 'number' ? ps.netPay : 0);
  return { grossPay, netPay };
}

export default function FinancialAnalyticsTab({ payslips }) {
  if (!payslips || payslips.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
        No hay datos suficientes para mostrar estadísticas.
      </div>
    );
  }

  // Ordenamos del más antiguo al más nuevo para la tabla
  const sortedPayslips = [...payslips].reverse();

  // Calculamos promedios usando la función getAmounts
  let totalNeto = 0;
  let totalBruto = 0;
  let count = 0;

  sortedPayslips.forEach(ps => {
    const { grossPay, netPay } = getAmounts(ps);
    if (grossPay > 0 || netPay > 0) {
      totalNeto += netPay;
      totalBruto += grossPay;
      count++;
    }
  });

  const avgNeto = count > 0 ? (totalNeto / count).toFixed(2) : 0;
  const avgBruto = count > 0 ? (totalBruto / count).toFixed(2) : 0;

  // ¿Algún recibo tiene datos financieros?
  const hasFinancialData = sortedPayslips.some(ps => {
    const { grossPay, netPay } = getAmounts(ps);
    return grossPay > 0 || netPay > 0;
  });

  return (
    <div className="glass-panel">
      <h2><TrendingUp size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Análisis Financiero</h2>
      <p style={{ fontSize: '14px', marginBottom: '24px' }}>
        Resumen de la evolución de tus remuneraciones netas y brutas a lo largo de los períodos liquidados.
      </p>

      {!hasFinancialData && (
        <div className="alert alert-warning" style={{ marginBottom: '24px', padding: '12px 16px', fontSize: '13px' }}>
          <span>
            Los importes financieros no pudieron extraerse automáticamente de los PDFs de este período.
            Los montos se muestran como <b>-</b> cuando el recibo no contiene una capa de texto legible.
          </span>
        </div>
      )}

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
              const { grossPay, netPay } = getAmounts(ps);
              const deducciones = grossPay > 0 && netPay > 0 ? grossPay - netPay : 0;

              return (
                <tr key={ps.id}>
                  <td style={{ fontWeight: '600' }}>{ps.month || ps.periodo || ps.period || '-'}</td>
                  <td>{grossPay > 0 ? `$${grossPay.toFixed(2)}` : '-'}</td>
                  <td style={{ color: 'var(--success)' }}>{netPay > 0 ? `$${netPay.toFixed(2)}` : '-'}</td>
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
