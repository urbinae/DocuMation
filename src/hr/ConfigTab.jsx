import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Users, Settings, Upload, CheckCircle,
  Clock, Mail, Download, Trash2, Send, Plus,
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5173' : '';

export default function ConfigTab({ companyName, setCompanyName, smtpSettings, googleSettings, refreshSettings, triggerAlert }) {
  const [smtpForm, setSmtpForm] = useState({
    SMTP_HOST: '',
    SMTP_PORT: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: ''
  });

  const [googleForm, setGoogleForm] = useState({
    googleClientId: '',
    googleAllowedDomain: ''
  });

  useEffect(() => {
    if (smtpSettings) {
      setSmtpForm(smtpSettings);
    }
  }, [smtpSettings]);

  useEffect(() => {
    if (googleSettings) {
      setGoogleForm(googleSettings);
    }
  }, [googleSettings]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          smtpHost: smtpForm.SMTP_HOST,
          smtpPort: smtpForm.SMTP_PORT,
          smtpUser: smtpForm.SMTP_USER,
          smtpPass: smtpForm.SMTP_PASS,
          smtpFrom: smtpForm.SMTP_FROM,
          googleClientId: googleForm.googleClientId,
          googleAllowedDomain: googleForm.googleAllowedDomain
        })
      });
      if (!res.ok) throw new Error('Error al guardar configuración');

      triggerAlert('success', 'Configuración guardada correctamente.');
      refreshSettings();
    } catch (err) {
      triggerAlert('error', err.message);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="glass-panel">
        <h3>Configuración General</h3>
        <form onSubmit={handleSave} style={{ marginTop: '20px' }}>
          <div className="form-group">
            <label>Nombre de la Empresa</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />

          <h4 style={{ marginBottom: '16px' }}>Servidor de Correo (SMTP)</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Si no se configuran credenciales reales, el sistema operará en **Modo Simulación**, guardando los emails de forma local en la carpeta `server/mail-logs` para inspección.
          </p>

          <div className="form-group">
            <label>Servidor SMTP</label>
            <input
              type="text"
              placeholder="smtp.gmail.com"
              value={smtpForm.SMTP_HOST}
              onChange={(e) => setSmtpForm({ ...smtpForm, SMTP_HOST: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Puerto SMTP</label>
            <input
              type="text"
              placeholder="587"
              value={smtpForm.SMTP_PORT}
              onChange={(e) => setSmtpForm({ ...smtpForm, SMTP_PORT: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Usuario / Email SMTP</label>
            <input
              type="text"
              placeholder="correo@empresa.com"
              value={smtpForm.SMTP_USER}
              onChange={(e) => setSmtpForm({ ...smtpForm, SMTP_USER: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Contraseña SMTP</label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={smtpForm.SMTP_PASS}
              onChange={(e) => setSmtpForm({ ...smtpForm, SMTP_PASS: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Remitente (Email FROM)</label>
            <input
              type="text"
              placeholder="no-reply@empresa.com"
              value={smtpForm.SMTP_FROM}
              onChange={(e) => setSmtpForm({ ...smtpForm, SMTP_FROM: e.target.value })}
            />
          </div>

          <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />

          <h4 style={{ marginBottom: '16px' }}>Inicio de Sesión con Google</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Habilite y restrinja el inicio de sesión del portal de empleados mediante cuentas de Google Workspace.
          </p>

          <div className="form-group">
            <label>Google Client ID</label>
            <input
              type="text"
              placeholder="Ej: 123456-abcde.apps.googleusercontent.com"
              value={googleForm.googleClientId || ''}
              onChange={(e) => setGoogleForm({ ...googleForm, googleClientId: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Dominio Corporativo Permitido (ej: miempresa.com)</label>
            <input
              type="text"
              placeholder="miempresa.com"
              value={googleForm.googleAllowedDomain || ''}
              onChange={(e) => setGoogleForm({ ...googleForm, googleAllowedDomain: e.target.value })}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Dejar vacío para permitir el acceso a cualquier cuenta de Google (no recomendado por seguridad).
            </p>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '24px' }}>
            Guardar Configuración
          </button>
        </form>
      </div>
    </div>
  );
}
