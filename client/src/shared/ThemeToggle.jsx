import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Users, Settings, Upload, CheckCircle, 
  Clock, Mail, Download, Trash2, Send, Plus, 
  FileUp, FileDown, ArrowRight, Eye, RefreshCw, X, LogOut, Lock, Key,
  BarChart2, AlertTriangle, TrendingUp, Calendar, FolderUp, Sun, Moon, Briefcase, Menu, Activity
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

export default function ThemeToggle({ theme, toggleTheme, floating = false }) {
  return (
    <button 
      onClick={toggleTheme} 
      className="btn btn-secondary" 
      style={floating ? {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1100,
        padding: '10px',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      } : {
        padding: '8px',
        borderRadius: '50%',
        width: '36px',
        height: '36px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-primary)'
      }}
      title={theme === 'dark' ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
    >
      {theme === 'dark' ? <Sun size={18} style={{ color: 'var(--warning)' }} /> : <Moon size={18} />}
    </button>
  );
}
