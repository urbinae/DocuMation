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
export default function EmployeeLogin({ setView, setEmployeeSession }) {
  const [cuil, setCuil] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [googleConfig, setGoogleConfig] = useState(null);

  useEffect(() => {
    // Obtener la configuración de Google desde el backend
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/google-config`);
        if (res.ok) {
          const data = await res.json();
          if (data.googleClientId) {
            setGoogleConfig(data);
          }
        }
      } catch (err) {
        console.error("Error al cargar la configuración de Google:", err);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!googleConfig || !googleConfig.googleClientId) return;

    // Cargar dinámicamente el SDK de inicio de sesión de Google
    const scriptId = "google-gsi-client-script";
    let script = document.getElementById(scriptId);

    const initGoogleSignIn = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: googleConfig.googleClientId,
        callback: handleGoogleLogin,
        hosted_domain: googleConfig.googleAllowedDomain || undefined
      });

      const btnElement = document.getElementById("google-signin-btn-container");
      if (btnElement) {
        window.google.accounts.id.renderButton(btnElement, {
          theme: "outline",
          size: "large",
          width: 336, // Ajustar al panel de login
          text: "signin_with",
          shape: "rectangular"
        });
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGoogleSignIn;
      document.body.appendChild(script);
    } else {
      if (window.google) {
        initGoogleSignIn();
      } else {
        script.onload = initGoogleSignIn;
      }
    }
  }, [googleConfig]);

  const handleGoogleLogin = async (response) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/employee/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fallo de autenticación con Google');

      setEmployeeSession(data.employee);
      setView('employee');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/employee/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuil, password })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Fallo de autenticación');
      
      setEmployeeSession(data.employee);
      setView('employee');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
      <div className="glass-panel" style={{ maxWidth: '400px', width: '100%', padding: '32px' }}>
        <h3 style={{ fontSize: '24px', marginBottom: '8px', textAlign: 'center' }}>Portal del Empleado</h3>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '24px' }}>
          Identifíquese con su CUIL y contraseña personal.
        </p>

        {error && (
          <div className="alert alert-error" style={{ padding: '10px', fontSize: '13px', marginBottom: '16px' }}>
            <X size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>CUIL / CUIT</label>
            <input 
              type="text" 
              placeholder="Ej. 20-12345678-9" 
              value={cuil}
              onChange={(e) => setCuil(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            💡 <b>Nota:</b> Si es tu primer ingreso, tu contraseña por defecto son los números de tu CUIL sin guiones (ej: 20123456789).
          </p>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? "Verificando..." : "Ingresar"}
          </button>

          {googleConfig && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: 'var(--text-muted)' }}>
                <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--border-color)' }} />
                <span style={{ padding: '0 10px', fontSize: '12px' }}>O iniciar sesión con</span>
                <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--border-color)' }} />
              </div>
              <div 
                id="google-signin-btn-container" 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  minHeight: '40px',
                  background: 'white',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  padding: '1px'
                }} 
              />
            </>
          )}

          <button 
            type="button" 
            className="btn btn-secondary" 
            style={{ width: '100%', marginTop: '12px' }}
            onClick={() => setView('hub')}
          >
            Volver al inicio
          </button>
        </form>
      </div>
    </div>
  );
}
