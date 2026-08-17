import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Users, Settings, Upload, CheckCircle,
  Clock, Mail, Download, Trash2, Send, Plus,
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Commercial module (untouched)
import { CommercialLogin, CommercialDashboard } from './Commercial';
import { ClientPortal } from './ClientPortal';

// HR module
import HRLogin from './hr/HRLogin';
import HRDashboard from './hr/HRDashboard';

// Employee module
import EmployeeLogin from './employee/EmployeeLogin';
import EmployeeDashboard from './employee/EmployeeDashboard';
import EmployeePortal from './employee/EmployeePortal';

// Shared
import ThemeToggle from './shared/ThemeToggle';
import AccessHub from './shared/AccessHub';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5173' : '';

export default function App() {
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos

  const [view, setView] = useState(() => {
    const saved = localStorage.getItem('view');
    return saved || 'hub';
  });
  const [hrTab, setHrTab] = useState('dashboard');
  const [token, setToken] = useState(null);

  const [employeeSession, setEmployeeSession] = useState(() => {
    const saved = localStorage.getItem('employeeSession');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Date.now() < parsed.expiresAt) return parsed.data;
      } catch (e) { }
    }
    return null;
  });

  const [hrSession, setHrSession] = useState(() => {
    const saved = localStorage.getItem('hrSession');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Date.now() < parsed.expiresAt) return parsed.data;
      } catch (e) { }
    }
    return null;
  });

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  // Guardar vista actual
  useEffect(() => {
    localStorage.setItem('view', view);

    // Redirecciones de seguridad si no hay sesión
    if (view === 'employee' && !employeeSession) setView('hub');
    if (view === 'hr' && !hrSession) setView('hub');
  }, [view, employeeSession, hrSession]);

  // Manejar persistencia de sesión e inactividad
  useEffect(() => {
    let lastUpdate = Date.now();

    const updateStorage = () => {
      const now = Date.now();
      if (now - lastUpdate > 5000) { // Throttling: actualizar cada 5 segs máximo
        lastUpdate = now;
        if (employeeSession) {
          localStorage.setItem('employeeSession', JSON.stringify({ data: employeeSession, expiresAt: Date.now() + SESSION_TIMEOUT }));
        }
        if (hrSession) {
          localStorage.setItem('hrSession', JSON.stringify({ data: hrSession, expiresAt: Date.now() + SESSION_TIMEOUT }));
        }
      }
    };

    // Actualizar almacenamiento inicial si hay sesión
    updateStorage();

    const handleActivity = () => updateStorage();

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('scroll', handleActivity);

    const interval = setInterval(() => {
      const checkSession = (key, sessionData, setSessionFn) => {
        if (!sessionData) return;
        const saved = localStorage.getItem(key);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Date.now() > parsed.expiresAt) {
              localStorage.removeItem(key);
              setSessionFn(null);
              alert("Tu sesión ha expirado por inactividad de 30 minutos.");
            }
          } catch (e) { }
        }
      };

      checkSession('employeeSession', employeeSession, setEmployeeSession);
      checkSession('hrSession', hrSession, setHrSession);
    }, 60000); // Revisar cada 1 minuto

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      clearInterval(interval);
    };
  }, [employeeSession, hrSession]);

  // Sincronizar tema con atributo data-theme y localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Solicitar permisos y registrar Web Push al iniciar sesión como empleado
  useEffect(() => {
    if (employeeSession && employeeSession.id) {
      registerPushNotifications(employeeSession.id);
    }
  }, [employeeSession]);

  const registerPushNotifications = async (employeeId) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn("Este navegador no soporta Notificaciones Push.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log("[Service Worker] Registrado correctamente:", registration.scope);

      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        console.warn("Permiso de notificaciones denegado.");
        return;
      }

      const keyRes = await fetch(`${API_BASE}/api/auth/vapid-public-key`);
      if (!keyRes.ok) throw new Error("Error al obtener VAPID public key");
      const { publicKey } = await keyRes.json();

      if (!publicKey) {
        console.warn("No hay clave VAPID pública configurada.");
        return;
      }

      const urlBase64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await fetch(`${API_BASE}/api/employee/push-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, subscription })
      });
      console.log("[Push] Suscripción registrada en el servidor.");
    } catch (err) {
      console.error("[Push] Error de registro:", err);
    }
  };

  // Cargar token de la URL si existe (ej: ?token=XYZ o #?token=XYZ)
  useEffect(() => {
    const handleUrlToken = () => {
      const searchParams = new URLSearchParams(window.location.search);
      let t = searchParams.get('token');

      if (!t && window.location.hash) {
        const hashQuery = window.location.hash.split('?')[1];
        if (hashQuery) {
          const hashParams = new URLSearchParams(hashQuery);
          t = hashParams.get('token');
        }
      }

      if (t) {
        setToken(t);
        setView('direct-sign');
      }
    };

    handleUrlToken();
    window.addEventListener('hashchange', handleUrlToken);
    return () => window.removeEventListener('hashchange', handleUrlToken);
  }, []);

  const handleLogout = () => {
    setEmployeeSession(null);
    setHrSession(null);
    setView('hub');
  };

  switch (view) {
    case 'hub':
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} floating={true} />
          <AccessHub setView={setView} />
        </>
      );
    case 'hr-login':
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} floating={true} />
          <HRLogin setView={setView} setHrSession={setHrSession} />
        </>
      );
    case 'employee-login':
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} floating={true} />
          <EmployeeLogin setView={setView} setEmployeeSession={setEmployeeSession} />
        </>
      );
    case 'hr':
      return hrSession ? (
        <HRDashboard
          hrSession={hrSession}
          activeTab={hrTab}
          setActiveTab={setHrTab}
          handleLogout={handleLogout}
          theme={theme}
          toggleTheme={toggleTheme}
          switchToEmployeeView={() => {
            if (hrSession.employee) {
              setEmployeeSession(hrSession.employee);
              setView('employee');
            }
          }}
        />
      ) : (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} floating={true} />
          <HRLogin setView={setView} setHrSession={setHrSession} />
        </>
      );
    case 'employee':
      return employeeSession ? (
        <EmployeeDashboard
          employee={employeeSession}
          handleLogout={handleLogout}
          theme={theme}
          toggleTheme={toggleTheme}
          switchToHrView={() => {
            if (employeeSession.role === 'rrhh') {
              setHrSession({ isLoggedIn: true, employee: employeeSession });
              setView('hr');
            }
          }}
        />
      ) : (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} floating={true} />
          <EmployeeLogin setView={setView} setEmployeeSession={setEmployeeSession} />
        </>
      );
    case 'direct-sign':
      return <EmployeePortal token={token} handleLogout={handleLogout} isDirectSign={true} theme={theme} toggleTheme={toggleTheme} />;
    default:
      return (
        <>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} floating={true} />
          <AccessHub setView={setView} />
        </>
      );
  }
}

// ==========================================
// 0. HUB DE ACCESO
// ==========================================

