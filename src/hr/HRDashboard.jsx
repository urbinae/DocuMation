
import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Users, Settings, Upload, CheckCircle,
  Clock, Mail, Download, Trash2, Send, Plus,
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5173' : '';

import ThemeToggle from '../shared/ThemeToggle';
import DashboardTab from './DashboardTab';
import PayslipsTab from './PayslipsTab';

import EmployeesTab from './EmployeesTab';
import ConfigTab from './ConfigTab';
import DebtorsTab from './DebtorsTab';
import RiskTab from './RiskTab';

export default function HRDashboard({ hrSession, activeTab, setActiveTab, handleLogout, theme, toggleTheme, switchToEmployeeView }) {
  const [employees, setEmployees] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [companyName, setCompanyName] = useState('Mi Empresa S.A.');
  const [smtpSettings, setSmtpSettings] = useState({
    SMTP_HOST: '',
    SMTP_PORT: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: ''
  });
  const [googleSettings, setGoogleSettings] = useState({
    googleClientId: '',
    googleAllowedDomain: ''
  });

  const [alert, setAlert] = useState(null);

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/employees`);
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
        return;
      }
    } catch (e) {
      console.error(e);
    }
    const saved = localStorage.getItem('mock_employees');
    if (saved) {
      try {
        setEmployees(JSON.parse(saved));
      } catch (err) {
        setEmployees([]);
      }
    } else {
      const defaultEmps = [
        { id: 1, name: 'Juan Pérez', email: 'juan.perez@empresa.com', cuil: '20-12345678-9', role: 'empleado', puesto: 'Desarrollador', fechaIngreso: '2023-01-15', archived: false },
        { id: 2, name: 'María Gómez', email: 'maria.gomez@empresa.com', cuil: '27-98765432-1', role: 'rrhh', puesto: 'Analista de RRHH', fechaIngreso: '2022-05-10', archived: false }
      ];
      setEmployees(defaultEmps);
      localStorage.setItem('mock_employees', JSON.stringify(defaultEmps));
    }
  };

  const fetchPayslips = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/payslips`);
      const data = await res.json();
      setPayslips(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      const data = await res.json();
      setCompanyName(data.companyName);
      setSmtpSettings({
        SMTP_HOST: data.smtpHost,
        SMTP_PORT: data.smtpPort,
        SMTP_USER: data.smtpUser,
        SMTP_PASS: data.smtpPass,
        SMTP_FROM: data.smtpFrom
      });
      setGoogleSettings({
        googleClientId: data.googleClientId,
        googleAllowedDomain: data.googleAllowedDomain
      });
    } catch (e) {
      console.error("Error al cargar configuración:", e);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchPayslips();
    fetchSettings();
  }, []);

  const triggerAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

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
        <div className="nav-links">
          <button
            className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <BarChart2 size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Dashboard KPIs
          </button>
          <button
            className={`nav-link ${activeTab === 'recibos' ? 'active' : ''}`}
            onClick={() => setActiveTab('recibos')}
          >
            <FileText size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Recibos de Sueldo
          </button>
          <button
            className={`nav-link ${activeTab === 'empleados' ? 'active' : ''}`}
            onClick={() => setActiveTab('empleados')}
          >
            <Users size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Nómina de Empleados
          </button>
          <button
            className={`nav-link ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            <Settings size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Configuración
          </button>
          <button
            className={`nav-link ${activeTab === 'deudores' ? 'active' : ''}`}
            onClick={() => setActiveTab('deudores')}
          >
            <AlertTriangle size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Deudores
          </button>
          <button
            className={`nav-link ${activeTab === 'riesgo' ? 'active' : ''}`}
            onClick={() => setActiveTab('riesgo')}
          >
            <Activity size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Riesgo
          </button>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', marginRight: '4px', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px', height: '24px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Hola, <strong style={{ color: 'var(--text-primary)' }}>{hrSession && hrSession.employee ? hrSession.employee.name : 'Administrador'}</strong>
            </span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '8px',
              background: hrSession && hrSession.employee ? 'rgba(255, 112, 67, 0.15)' : 'rgba(255,255,255,0.05)',
              color: hrSession && hrSession.employee ? '#ff7043' : 'var(--text-muted)',
              border: hrSession && hrSession.employee ? '1px solid rgba(255, 112, 67, 0.3)' : '1px solid rgba(255,255,255,0.1)',
              fontWeight: '600'
            }}>
              {hrSession && hrSession.employee ? 'RRHH' : 'Master'}
            </span>
            {hrSession && hrSession.employee && (
              <button
                className="btn btn-secondary"
                onClick={switchToEmployeeView}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginLeft: '8px',
                  background: 'rgba(255,255,255,0.05)'
                }}
                title="Ir a mi portal de firmas de recibo"
              >
                <Users size={12} />
                Vista Empleado
              </button>
            )}
          </div>

          <button
            className="nav-link"
            style={{ color: 'var(--danger)', marginLeft: '12px' }}
            onClick={handleLogout}
          >
            <LogOut size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Cerrar Sesión
          </button>
        </div>
      </nav>

      <main className="main-content">
        {alert && (
          <div className={`alert alert-${alert.type}`}>
            {alert.type === 'success' ? <CheckCircle size={20} /> : <X size={20} />}
            <span>{alert.message}</span>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab
            payslips={payslips}
            employees={employees}
            refreshData={fetchPayslips}
            triggerAlert={triggerAlert}
          />
        )}

        {activeTab === 'recibos' && (
          <PayslipsTab
            payslips={payslips}
            employees={employees}
            refreshData={fetchPayslips}
            triggerAlert={triggerAlert}
          />
        )}

        {activeTab === 'empleados' && (
          <EmployeesTab
            employees={employees}
            refreshData={fetchEmployees}
            triggerAlert={triggerAlert}
          />
        )}

        {activeTab === 'config' && (
          <ConfigTab
            companyName={companyName}
            setCompanyName={setCompanyName}
            smtpSettings={smtpSettings}
            googleSettings={googleSettings}
            refreshSettings={fetchSettings}
            triggerAlert={triggerAlert}
          />
        )}

        {activeTab === 'deudores' && (
          <DebtorsTab
            payslips={payslips}
            employees={employees}
            refreshData={fetchPayslips}
            triggerAlert={triggerAlert}
          />
        )}

        {activeTab === 'riesgo' && (
          <RiskTab
            payslips={payslips}
            employees={employees}
          />
        )}
      </main>
    </>
  );
}
