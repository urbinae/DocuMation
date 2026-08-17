import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Users, Settings, Upload, CheckCircle,
  Clock, Mail, Download, Trash2, Send, Plus,
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5173' : '';

export default function AccessHub({ setView }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
      <div className="glass-panel" style={{ maxWidth: '700px', width: '100%', textAlign: 'center', padding: '48px 32px' }}>
        <div className="logo-icon" style={{ width: '64px', height: '64px', fontSize: '32px', margin: '0 auto 24px auto', borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>e</div>
        <h1 style={{ fontSize: '36px', marginBottom: '8px', fontFamily: 'var(--font-title)', fontWeight: '800' }}>
          <span style={{ color: 'var(--primary)' }}>e-</span>
          <span style={{ color: '#fff' }}>ABC</span>
          <span style={{ fontWeight: '300', color: 'var(--text-secondary)' }}> DocuMation</span>
        </h1>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '40px' }}>
          Bienvenido al sistema de distribución, firma y control de recibos de haberes. Seleccione su perfil para ingresar.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Card Empleados */}
          <div
            className="glass-panel"
            style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}
            onClick={() => setView('employee-login')}
          >
            <div className="stat-icon success" style={{ margin: '0 auto 16px auto', width: '56px', height: '56px' }}>
              <Users size={28} />
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Acceso Empleados</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Firma electrónica de tus recibos y consulta de tu historial de haberes.
            </p>
          </div>

          {/* Card RRHH */}
          <div
            className="glass-panel"
            style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}
            onClick={() => setView('hr-login')}
          >
            <div className="stat-icon primary" style={{ margin: '0 auto 16px auto', width: '56px', height: '56px' }}>
              <Lock size={28} />
            </div>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Administración RRHH</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Carga masiva, distribución por correo y seguimiento del estado de firmas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
