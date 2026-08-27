import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Users, Settings, Upload, CheckCircle, 
  Clock, Mail, Download, Trash2, Send, Plus, 
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

import ThemeToggle from '../shared/ThemeToggle';
import FinancialAnalyticsTab from './FinancialAnalyticsTab';
import EmployeePortal from './EmployeePortal';
export default function EmployeeDashboard({ employee, handleLogout, theme, toggleTheme, switchToHrView }) {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSignPayslip, setActiveSignPayslip] = useState(null); // Recibo actualmente en firma
  const [employeeTab, setEmployeeTab] = useState('recibos'); // 'recibos' o 'analisis'

  const fetchPayslips = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/employee/payslips/${employee.id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setPayslips(data);
          return;
        }
      }
      setPayslips([]);
    } catch (e) {
      console.error(e);
      setPayslips([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employee?.id) {
      fetchPayslips();
    }
  }, [employee?.id]);

  const handleFinishSigning = () => {
    setActiveSignPayslip(null);
    fetchPayslips();
  };

  if (activeSignPayslip) {
    return (
      <EmployeePortal 
        payslipToSign={activeSignPayslip} 
        handleLogout={handleFinishSigning} 
        isDirectSign={false} 
      />
    );
  }

  // Cálculos de KPIs del Empleado
  const payslipsList = Array.isArray(payslips) ? payslips : [];
  const totalPayslips = payslipsList.length;
  const signedPayslips = payslipsList.filter(p => p.status === 'Firmado' || p.status === 'firmado').length;
  const pendingPayslips = payslipsList.filter(p => p.status !== 'Firmado' && p.status !== 'firmado' && (p.duplicadoPath || p.file_path)).length;
  const complianceRate = totalPayslips > 0 ? Math.round((signedPayslips / totalPayslips) * 100) : 0;

  return (
    <>
      <nav className="navbar">
        <div className="logo-container">
          <div className="logo-icon" style={{ borderRadius: '50%', background: 'var(--primary)', color: '#fff', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>e</div>
          <span className="logo-text" style={{ fontFamily: 'var(--font-title)', fontSize: '20px', fontWeight: '800' }}>
            <span style={{ color: 'var(--primary)' }}>e-</span>
            <span style={{ color: '#fff' }}>ABC</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px', marginLeft: '6px', fontWeight: 'normal' }}>DocuMation</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Empleado: <b style={{ color: '#fff' }}>{employee.name}</b> (CUIL: {employee.cuil})
            {employee.puesto && ` | Puesto: ${employee.puesto}`}
            {employee.fechaIngreso && ` | Ingreso: ${new Date(employee.fechaIngreso + 'T00:00:00').toLocaleDateString('es-AR')}`}
          </span>
          {employee.role === 'rrhh' && (
            <button 
              className="btn btn-secondary" 
              onClick={switchToHrView}
              style={{ 
                padding: '6px 12px', 
                fontSize: '12px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px',
                border: '1px solid rgba(255, 112, 67, 0.3)',
                color: '#ff7043'
              }}
              title="Ir al panel de administración de RRHH"
            >
              <Lock size={12} />
              Vista RRHH
            </button>
          )}
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={handleLogout}>
            <LogOut size={14} />
            Cerrar Sesión
          </button>
        </div>
      </nav>

      <main className="main-content" style={{ maxWidth: '1000px' }}>
        
        {/* Selector de Pestañas del Empleado */}
        {!loading && totalPayslips > 0 && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <button 
              className={`btn ${employeeTab === 'recibos' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setEmployeeTab('recibos')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}
            >
              <FileText size={16} />
              Mis Recibos
            </button>
            <button 
              className={`btn ${employeeTab === 'analisis' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setEmployeeTab('analisis')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}
            >
              <TrendingUp size={16} />
              Análisis Financiero
            </button>
          </div>
        )}

        {employeeTab === 'recibos' ? (
          <>
            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2>Mi Historial de Recibos</h2>
                <p style={{ fontSize: '14px', marginTop: '4px' }}>
                  Consulte sus recibos de sueldo liquidados, descargue sus copias o firme los que se encuentren pendientes de conformidad.
                </p>
              </div>
            </div>

            {/* KPIs del Empleado */}
            {!loading && totalPayslips > 0 && (
              <>
                <div className="dashboard-grid" style={{ marginBottom: '24px', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div className="glass-panel stat-card" style={{ padding: '16px 20px' }}>
                    <div className="stat-icon primary" style={{ width: '40px', height: '40px' }}><FileText size={20} /></div>
                    <div className="stat-info">
                      <h3 style={{ fontSize: '20px' }}>{totalPayslips}</h3>
                      <p style={{ fontSize: '11px' }}>Recibos Totales</p>
                    </div>
                  </div>
                  <div className="glass-panel stat-card" style={{ padding: '16px 20px' }}>
                    <div className="stat-icon success" style={{ width: '40px', height: '40px' }}><CheckCircle size={20} /></div>
                    <div className="stat-info">
                      <h3 style={{ fontSize: '20px' }}>{signedPayslips} <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--text-secondary)' }}>({complianceRate}%)</span></h3>
                      <p style={{ fontSize: '11px' }}>Firmados (Conformados)</p>
                    </div>
                  </div>
                  <div className="glass-panel stat-card" style={{ padding: '16px 20px' }}>
                    <div className="stat-icon warning" style={{ width: '40px', height: '40px' }}><Clock size={20} /></div>
                    <div className="stat-info">
                      <h3 style={{ fontSize: '20px' }}>{pendingPayslips}</h3>
                      <p style={{ fontSize: '11px' }}>Pendientes de Firma</p>
                    </div>
                  </div>
                </div>

                {/* Alerta Dinámica de Estado */}
                {pendingPayslips > 0 ? (
                  <div className="alert alert-warning" style={{ marginBottom: '24px', padding: '12px 16px', fontSize: '13px' }}>
                    <AlertTriangle size={18} />
                    <span>
                      <b>Atención:</b> Tienes <b>{pendingPayslips} recibos pendientes</b> de firma electrónica. Por favor, revísalos y confórmalos a la brevedad.
                    </span>
                  </div>
                ) : (
                  <div className="alert alert-success" style={{ marginBottom: '24px', padding: '12px 16px', fontSize: '13px' }}>
                    <CheckCircle size={18} />
                    <span>
                      <b>¡Todo al día!</b> Has firmado la conformidad de todos tus recibos de sueldo disponibles.
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="glass-panel">
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <RefreshCw className="spin" size={24} style={{ animation: 'spin 2s linear infinite' }} />
                  <p style={{ marginTop: '12px' }}>Cargando recibos...</p>
                </div>
              ) : payslipsList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No tienes ningún recibo de haberes disponible en el sistema.
                </div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th>Documento Original</th>
                        <th>Documento Duplicado</th>
                        <th>Estado de Conformidad</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslipsList.map(ps => {
                        const hasOriginal = !!ps.originalPath;
                        const hasDuplicado = !!ps.duplicadoPath;
                        const isSigned = ps.status === 'Firmado';

                        return (
                          <tr key={ps.id}>
                            <td style={{ fontWeight: '600' }}>{ps.month}</td>
                            <td>
                              {hasOriginal ? (
                                <a href={`${API_BASE}/api/download/original/${ps.id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                                  <Download size={12} />
                                  Descargar
                                </a>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No cargado</span>
                              )}
                            </td>
                            <td>
                              {isSigned ? (
                                <a href={`${API_BASE}/api/download/signed/${ps.id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                                  <Download size={12} />
                                  Descargar Firmado
                                </a>
                              ) : hasDuplicado ? (
                                <a href={`${API_BASE}/api/download/duplicado/${ps.id}`} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                                  <Download size={12} />
                                  Borrador
                                </a>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No cargado</span>
                              )}
                            </td>
                            <td>
                              <span className={`badge badge-${ps.status.toLowerCase()}`}>
                                {ps.status}
                              </span>
                              {ps.signedAt && (
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                  Conformado el {new Date(ps.signedAt).toLocaleDateString()}
                                </div>
                              )}
                            </td>
                            <td>
                              {!isSigned && hasDuplicado ? (
                                <button 
                                  className="btn btn-primary"
                                  style={{ padding: '8px 16px', fontSize: '13px' }}
                                  onClick={() => setActiveSignPayslip(ps)}
                                >
                                  <Key size={13} style={{ marginRight: '6px' }} />
                                  Firmar Recibo
                                </button>
                              ) : isSigned ? (
                                <span style={{ color: 'var(--success)', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <CheckCircle size={14} /> Conformado
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Falta Duplicado</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <FinancialAnalyticsTab payslips={payslips} />
        )}
      </main>
    </>
  );
}
