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
export default function EmployeePortal({ token, payslipToSign = null, handleLogout, isDirectSign = true, theme, toggleTheme }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [payslip, setPayslip] = useState(null);
  const [activePdfTab, setActivePdfTab] = useState('duplicado');
  const [consent, setConsent] = useState(false);
  const [isSignedSuccess, setIsSignedSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [signaturePos, setSignaturePos] = useState({ x: 50, y: 50 });
  const [isDraggingSig, setIsDraggingSig] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pdfDim, setPdfDim] = useState({ width: 0, height: 0 });
  const [sigSize, setSigSize] = useState({ width: 160, height: 100 });
  const [isResizing, setIsResizing] = useState(false);
  
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);

  const handleSigMouseDown = (e) => {
    setIsDraggingSig(true);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: clientX - rect.left, y: clientY - rect.top });
    if(e.currentTarget.setPointerCapture && e.pointerId) e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePdfMouseMove = (e) => {
    if (!isDraggingSig) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const parentRect = e.currentTarget.getBoundingClientRect();
    let newX = clientX - parentRect.left - dragOffset.x;
    let newY = clientY - parentRect.top - dragOffset.y;
    
    newX = Math.max(0, Math.min(newX, pdfDim.width - sigSize.width));
    newY = Math.max(0, Math.min(newY, pdfDim.height - sigSize.height));
    
    setSignaturePos({ x: newX, y: newY });
  };

  const handlePdfMouseUp = (e) => {
    setIsDraggingSig(false);
    if(e && e.currentTarget && e.currentTarget.releasePointerCapture && e.pointerId) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleResizePointerDown = (e) => {
    e.stopPropagation();
    setIsResizing(true);
    if(e.target.setPointerCapture && e.pointerId) e.target.setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e) => {
    if (!isResizing) return;
    const pageEl = document.querySelector('.react-pdf__Page');
    if (!pageEl) return;
    
    const parentRect = pageEl.getBoundingClientRect();
    
    const boxLeft = parentRect.left + signaturePos.x;
    const newWidth = e.clientX - boxLeft;
    
    const finalWidth = Math.max(100, Math.min(newWidth, pdfDim.width - signaturePos.x));
    const finalHeight = finalWidth * (100 / 160); // Mantener proporción original 160x100

    setSigSize({ width: finalWidth, height: finalHeight });
  };

  const handleResizePointerUp = (e) => {
    e.stopPropagation();
    setIsResizing(false);
    if(e.target.releasePointerCapture && e.pointerId) e.target.releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    const fetchTokenInfo = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sign/token/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Token no válido');
        
        setPayslip(data);
        if (data.status === 'Firmado') {
          setIsSignedSuccess(true);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (isDirectSign && token) {
      fetchTokenInfo();
    } else if (!isDirectSign && payslipToSign) {
      // Si entramos por panel de empleado ya tenemos la info del recibo
      setPayslip({
        id: payslipToSign.id,
        month: payslipToSign.month,
        status: payslipToSign.status,
        employeeName: payslipToSign.employeeName,
        employeeCuil: payslipToSign.employeeCuil,
        hasOriginal: !!payslipToSign.originalPath,
        hasDuplicado: !!payslipToSign.duplicadoPath
      });
      setLoading(false);
    }
  }, [token, payslipToSign, isDirectSign]);

  useEffect(() => {
    if (loading || error || isSignedSuccess || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [loading, error, isSignedSuccess]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingRef.current = true;
  };

  const draw = (e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        clearCanvas();
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmSign = async () => {
    if (!consent) {
      window.alert("Debes aceptar el consentimiento antes de firmar.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let isBlank = true;
    try {
      const buffer = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < buffer.length; i += 4) {
        if (buffer[i] > 0) {
          isBlank = false;
          break;
        }
      }
    } catch (err) {
      // Si tira error de seguridad por canvas tainted (ej. imagen cross-origin temporal), asumimos que no está en blanco.
      console.warn("No se pudo verificar píxeles por seguridad, asumiendo firmado:", err);
      isBlank = false;
    }

    if (isBlank && !isDrawingRef.current) {
      window.alert("Por favor, dibuja tu firma en el panel o sube una imagen antes de confirmar.");
      return;
    }

    try {
      const signatureBase64 = canvas.toDataURL('image/png');
      setIsSubmitting(true);

      // Determinar endpoint y método a usar según si es acceso directo o por panel
      const endpoint = isDirectSign 
        ? `${API_BASE}/api/sign/${token}` 
        : `${API_BASE}/api/sign-by-id/${payslip.id}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          signatureImage: signatureBase64, 
          consent: true,
          position: activePdfTab === 'duplicado' ? {
            x: isNaN(signaturePos.x) ? 50 : signaturePos.x,
            y: isNaN(signaturePos.y) ? 50 : signaturePos.y,
            page: 1,
            pdfWidth: pdfDim.width || 600,
            pdfHeight: pdfDim.height || 800,
            width: sigSize.width || 140,
            height: sigSize.height || 55
          } : null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar la firma');
      
      setIsSignedSuccess(true);
    } catch (err) {
      window.alert("Hubo un error al firmar: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // URL para el PDF stream
  const pdfStreamUrl = isDirectSign 
    ? `${API_BASE}/api/sign/view/${token}/${activePdfTab}#toolbar=0` 
    : `${API_BASE}/api/payslips/view/${payslip?.id}/${activePdfTab}#toolbar=0`;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-main)' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw className="spin" size={48} style={{ color: 'var(--primary)', animation: 'spin 2s linear infinite' }} />
          <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Cargando portal seguro...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-main)' }}>
        <div className="glass-panel" style={{ maxWidth: '450px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifycontent: 'center', margin: '0 auto 20px auto', color: 'var(--danger)' }}>
            <X size={32} />
          </div>
          <h2 style={{ marginBottom: '10px' }}>Enlace Inválido</h2>
          <p>{error}</p>
          <p style={{ fontSize: '13px', marginTop: '16px', color: 'var(--text-muted)' }}>
            Por favor, asegúrate de haber copiado todo el enlace del email o contacta al departamento de RRHH.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-layout">
      <header className="portal-header">
        <div className="logo-container">
          <div className="logo-icon" style={{ borderRadius: '50%', background: 'var(--primary)', color: '#fff', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>e</div>
          <span className="logo-text" style={{ fontFamily: 'var(--font-title)', fontSize: '20px', fontWeight: '800' }}>
            <span style={{ color: 'var(--primary)' }}>e-</span>
            <span style={{ color: '#fff' }}>ABC</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px', marginLeft: '6px', fontWeight: 'normal' }}>DocuMation</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Empleado: <b>{payslip.employeeName}</b> (CUIL: {payslip.employeeCuil})
          </span>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={handleLogout}>
            {isDirectSign ? "Volver al inicio" : "Volver al listado"}
          </button>
        </div>
      </header>

      {isSignedSuccess ? (
        <div className="success-screen glass-panel">
          <div className="success-icon-container">
            <CheckCircle size={40} />
          </div>
          <h2>Recibo Firmado Exitosamente</h2>
          <p>
            Tu firma ha sido estampada con éxito en la copia **Duplicado** del recibo para el período de <b>{payslip.month}</b>. 
            Te hemos enviado un correo de confirmación con las copias adjuntas para tu resguardo personal.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '350px', margin: '0 auto' }}>
            {payslip.hasOriginal && (
              <a href={`${API_BASE}/api/download/original/${payslip.id}`} className="btn btn-secondary">
                <Download size={16} />
                Descargar Mi Recibo (Original)
              </a>
            )}
            <a href={`${API_BASE}/api/download/signed/${payslip.id}`} className="btn btn-primary" style={{ background: 'var(--success)', boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.3)' }}>
              <Download size={16} />
              Descargar Duplicado Firmado
            </a>
          </div>
        </div>
      ) : (
        <div className="portal-content">
          <div className="pdf-viewer-container">
            <div className="pdf-viewer-header">
              <span style={{ fontSize: '14px', fontWeight: '600' }}>
                Vista Previa: Período {payslip.month}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className={`pdf-tab-btn ${activePdfTab === 'original' ? 'active' : ''}`}
                  onClick={() => setActivePdfTab('original')}
                >
                  Original (Tu copia)
                </button>
                <button 
                  className={`pdf-tab-btn ${activePdfTab === 'duplicado' ? 'active' : ''}`}
                  onClick={() => setActivePdfTab('duplicado')}
                >
                  Duplicado (A Firmar)
                </button>
              </div>
            </div>
            
            <div 
              style={{ width: '100%', overflow: 'auto', background: '#e5e7eb', minHeight: '500px', display: 'flex', justifyContent: 'center', padding: '20px' }}
            >
              <Document 
                file={pdfStreamUrl}
                loading={<div style={{ padding: '20px' }}>Cargando PDF...</div>}
                error={<div style={{ padding: '20px', color: 'red' }}>Error al cargar el PDF</div>}
              >
                <div 
                  style={{ position: 'relative', display: 'inline-block', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  onMouseMove={handlePdfMouseMove}
                  onMouseUp={handlePdfMouseUp}
                  onMouseLeave={handlePdfMouseUp}
                  onTouchMove={handlePdfMouseMove}
                  onTouchEnd={handlePdfMouseUp}
                >
                  <Page 
                    pageNumber={1} 
                    renderTextLayer={false} 
                    renderAnnotationLayer={false}
                    onLoadSuccess={({ width, height }) => {
                      setPdfDim({ width, height });
                      // Posición inicial: Ajustado sobre la línea "Firma Empleado"
                      setSignaturePos({ x: 140, y: height - sigSize.height - 30 });
                    }}
                  />

                  {activePdfTab === 'duplicado' && pdfDim.width > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: signaturePos.x,
                        top: signaturePos.y,
                        width: `${sigSize.width}px`,
                        height: `${sigSize.height}px`,
                        border: '2px dashed var(--primary)',
                        background: 'rgba(29, 162, 220, 0.2)',
                        cursor: isDraggingSig ? 'grabbing' : 'grab',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        userSelect: 'none',
                        touchAction: 'none',
                        zIndex: 10
                      }}
                      onPointerDown={handleSigMouseDown}
                      onPointerMove={handlePdfMouseMove}
                      onPointerUp={handlePdfMouseUp}
                      onPointerCancel={handlePdfMouseUp}
                    >
                      Arrastrar Firma
                      
                      <div
                        style={{
                          position: 'absolute',
                          right: '-2px',
                          bottom: '-2px',
                          width: '20px',
                          height: '20px',
                          cursor: 'nwse-resize',
                          background: 'var(--primary)',
                          clipPath: 'polygon(100% 0, 100% 100%, 0 100%)'
                        }}
                        onPointerDown={handleResizePointerDown}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleResizePointerUp}
                        onPointerCancel={handleResizePointerUp}
                      />
                    </div>
                  )}
                </div>
              </Document>
            </div>
          </div>

          <div className="sign-panel">
            <div className="glass-panel">
              <h3 style={{ marginBottom: '12px' }}>Firma de Conformidad</h3>
              <p style={{ fontSize: '13px', marginBottom: '20px' }}>
                Estás visualizando el recibo de haberes. Para firmar, lee el consentimiento, dibuja tu firma manuscrita en el recuadro inferior y presiona "Confirmar y Enviar".
              </p>
              
              <div className="signature-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Dibuja tu firma o sube una imagen</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label className="nav-link" style={{ fontSize: '12px', padding: '2px 8px', cursor: 'pointer', margin: 0, textTransform: 'none' }}>
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                      Subir Imagen
                    </label>
                    <button className="nav-link" style={{ fontSize: '12px', padding: '2px 8px' }} onClick={clearCanvas}>
                      Limpiar panel
                    </button>
                  </div>
                </div>
                
                <div className="signature-canvas-container">
                  <canvas 
                    ref={canvasRef}
                    className="signature-canvas"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
              </div>

              <div className="consent-container">
                <input 
                  type="checkbox" 
                  id="consent-check" 
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <label htmlFor="consent-check" style={{ textTransform: 'none', fontWeight: '400', cursor: 'pointer', lineHeight: '1.4' }}>
                  Declaro bajo juramento que los datos liquidados en este recibo son correctos y doy mi conformidad firmando electrónicamente el documento Duplicado.
                </label>
              </div>
              
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '24px', padding: '14px', fontSize: '16px' }}
                onClick={handleConfirmSign}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="spin" size={16} style={{ animation: 'spin 2s linear infinite' }} />
                    Procesando firma y envío...
                  </>
                ) : (
                  <>
                    Confirmar y Firmar Duplicado
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
            
            <div className="glass-panel" style={{ padding: '16px', background: 'rgba(165, 194, 63, 0.05)', border: '1px solid rgba(165, 194, 63, 0.15)' }}>
              <h4 style={{ fontSize: '13px', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                🛡 Transacción Segura
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Se registrará tu dirección IP de conexión, la fecha/hora UTC exacta de la firma y el ID único del navegador. Estos datos se estamparán indeleblemente en el PDF Duplicado y formarán parte del registro de auditoría legal de RRHH.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
