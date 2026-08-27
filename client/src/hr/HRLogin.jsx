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
export default function HRLogin({ setView, setHrSession }) {
  const [loginMode, setLoginMode] = useState('personal'); // 'personal' o 'master'
  const [cuil, setCuil] = useState('');
  const [password, setPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
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
    if (loginMode !== 'personal' || !googleConfig || !googleConfig.googleClientId) return;

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

      const btnElement = document.getElementById("google-signin-btn-container-hr");
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
  }, [googleConfig, loginMode]);

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

      if (data.employee.role !== 'rrhh') {
        throw new Error('Acceso denegado. Tu cuenta no tiene permisos de RRHH.');
      }

      setHrSession({ isLoggedIn: true, employee: data.employee });
      setView('hr');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePersonalLogin = async (e) => {
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

      if (data.employee.role !== 'rrhh') {
        throw new Error('Acceso denegado. Tu cuenta no tiene permisos de RRHH.');
      }
      
      setHrSession({ isLoggedIn: true, employee: data.employee });
      setView('hr');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMasterLogin = (e) => {
    e.preventDefault();
    setError(null);
    if (masterPassword === 'admin123') {
      setHrSession({ isLoggedIn: true, employee: null });
      setView('hr');
    } else {
      setError("Contraseña maestra incorrecta.");
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
      <div className="glass-panel" style={{ maxWidth: '400px', width: '100%', padding: '32px' }}>
        <h3 style={{ fontSize: '24px', marginBottom: '8px', textAlign: 'center' }}>Portal de Administración</h3>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '24px' }}>
          Identifíquese para gestionar recibos de sueldo y personal.
        </p>

        {/* Control de pestañas */}
        <div style={{ display: 'flex', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', padding: '4px', marginBottom: '24px' }}>
          <button 
            type="button"
            className="btn"
            style={{
              flex: 1,
              background: loginMode === 'personal' ? 'var(--primary)' : 'transparent',
              color: loginMode === 'personal' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              padding: '8px',
              fontSize: '13px',
              fontWeight: '600',
              boxShadow: loginMode === 'personal' ? 'var(--shadow-sm)' : 'none'
            }}
            onClick={() => { setError(null); setLoginMode('personal'); }}
          >
            Cuenta Personal RRHH
          </button>
          <button 
            type="button"
            className="btn"
            style={{
              flex: 1,
              background: loginMode === 'master' ? 'var(--primary)' : 'transparent',
              color: loginMode === 'master' ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '6px',
              padding: '8px',
              fontSize: '13px',
              fontWeight: '600',
              boxShadow: loginMode === 'master' ? 'var(--shadow-sm)' : 'none'
            }}
            onClick={() => { setError(null); setLoginMode('master'); }}
          >
            Clave Maestra
          </button>
        </div>

        {error && (
          <div className="alert alert-error" style={{ padding: '10px', fontSize: '13px', marginBottom: '16px' }}>
            <X size={16} />
            <span>{error}</span>
          </div>
        )}

        {loginMode === 'personal' ? (
          <form onSubmit={handlePersonalLogin}>
            <div className="form-group">
              <label>CUIL / CUIT de RRHH</label>
              <input 
                type="text" 
                placeholder="Ej. 20-12345678-9" 
                value={cuil}
                onChange={(e) => setCuil(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Contraseña Personal</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
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
                  id="google-signin-btn-container-hr" 
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
          </form>
        ) : (
          <form onSubmit={handleMasterLogin}>
            <div className="form-group">
              <label>Contraseña Maestra de Acceso</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
              Ingresar con Clave Maestra
            </button>
          </form>
        )}

        <button 
          type="button" 
          className="btn btn-secondary" 
          style={{ width: '100%', marginTop: '16px' }}
          onClick={() => setView('hub')}
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
