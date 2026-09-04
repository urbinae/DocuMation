import React, { useState, useEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { CheckCircle, AlertTriangle, Download, Briefcase } from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
import { downloadPdfFile } from './utils/downloadHelper';

export function ClientPortal({ token, theme, toggleTheme }) {
  const [contract, setContract] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [signing, setSigning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [stampAllPages, setStampAllPages] = useState(false);

  // Posición por defecto de la firma (el cliente la puede arrastrar)
  const [signaturePos, setSignaturePos] = useState({ x: 100, y: 100 });
  const [sigSize, setSigSize] = useState({ width: 200, height: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    async function fetchContract() {
      if (!token) {
        setError("Token de acceso no proporcionado o enlace inválido.");
        setLoading(false);
        return;
      }
      try {
        setError(null);
        const res = await fetch(`${API_BASE}/api/contracts/verify/${token}`);
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Error al cargar el contrato');
        
        setContract(data.contract);
        setClient(data.client);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchContract();
  }, [token]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    // Posicionar la firma al final de la primera página por defecto
    setSignaturePos({ x: 100, y: 500 });
  };

  const handlePointerDown = (e) => {
    setIsDragging(true);
    const rect = e.target.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const pageEl = document.querySelector('.react-pdf__Page') || document.getElementById('pdf-page-container');
    if (!pageEl) return;
    
    const containerRect = pageEl.getBoundingClientRect();
    
    let newX = e.clientX - containerRect.left - dragOffset.x;
    let newY = e.clientY - containerRect.top - dragOffset.y;
    
    // Límites para no salirse del PDF reales
    newX = Math.max(0, Math.min(newX, pageEl.offsetWidth - sigSize.width));
    newY = Math.max(0, Math.min(newY, pageEl.offsetHeight - sigSize.height));

    setSignaturePos({ x: newX, y: newY });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  const handleResizePointerDown = (e) => {
    e.stopPropagation();
    setIsResizing(true);
    e.target.setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e) => {
    if (!isResizing) return;
    const pageEl = document.querySelector('.react-pdf__Page') || document.getElementById('pdf-page-container');
    if (!pageEl) return;
    
    const containerRect = pageEl.getBoundingClientRect();
    const boxLeft = containerRect.left + signaturePos.x;
    const newWidth = e.clientX - boxLeft;
    
    // Mantener aspect ratio aproximado (2:1) y limitar a contenedor
    const finalWidth = Math.max(100, Math.min(newWidth, pageEl.offsetWidth - signaturePos.x));
    const finalHeight = finalWidth / 2;

    setSigSize({ width: finalWidth, height: finalHeight });
  };

  const handleResizePointerUp = (e) => {
    e.stopPropagation();
    setIsResizing(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  const handleSign = async () => {
    if (!agreed) {
      alert("Debes aceptar los términos y condiciones del acuerdo comercial.");
      return;
    }

    setSigning(true);
    try {
      const pageEl = document.querySelector('.react-pdf__Page') || document.getElementById('pdf-page-container');
      const width = pageEl.offsetWidth;
      const height = pageEl.offsetHeight;

      const res = await fetch(`${API_BASE}/api/contracts/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          stampAllPages,
          signatureBox: {
            x: signaturePos.x,
            y: signaturePos.y,
            width: sigSize.width,
            height: sigSize.height,
            pageWidth: width,
            pageHeight: height,
            pageNumber: 1
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al firmar');
      
      setSuccess(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setSigning(false);
    }
  };

  const handleDownload = () => {
    if (contract?.id) {
      downloadPdfFile(`${API_BASE}/api/contracts/pdf/${contract.id}?download=true`, contract.title || `contrato_${contract.id}.pdf`);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '50px' }}>Cargando portal comercial...</div>;

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
        <div className="glass-panel" style={{ maxWidth: '500px', width: '100%', padding: '40px', textAlign: 'center' }}>
          <AlertTriangle size={48} color="var(--danger)" style={{ margin: '0 auto 16px' }} />
          <h2>Error de Acceso</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <nav className="navbar">
        <div className="logo-container">
          <div className="logo-icon" style={{ borderRadius: '50%', background: 'var(--warning)', color: '#fff', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>C</div>
          <span className="logo-text" style={{ fontFamily: 'var(--font-title)', fontSize: '20px', fontWeight: '800' }}>
            <span style={{ color: 'var(--primary)' }}>e-</span>
            <span style={{ color: '#fff' }}>ABC</span>
            <span style={{ color: 'var(--warning)', fontSize: '14px', marginLeft: '6px', fontWeight: 'bold' }}>Firma de Contrato</span>
          </span>
        </div>
      </nav>

      <main className="portal-content" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Lado Izquierdo: Visor PDF */}
        <div className="glass-panel" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Briefcase size={18} color="var(--warning)" />
              {contract.title}
            </h3>
            <button className="btn btn-secondary" onClick={handleDownload} title="Descargar PDF original">
              <Download size={16} /> Descargar
            </button>
          </div>
          
          <div style={{ flex: 1, overflow: 'auto', padding: '20px', background: '#333', display: 'flex', justifyContent: 'center' }}>
            <div id="pdf-page-container" style={{ position: 'relative', display: 'inline-block', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
              <Document
                file={`${API_BASE}/api/contracts/pdf/${contract.id}`}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={<div style={{ padding: '40px', color: 'white' }}>Cargando documento...</div>}
              >
                <Page 
                  pageNumber={1} 
                  renderTextLayer={false} 
                  renderAnnotationLayer={false}
                  width={800}
                />
              </Document>

              {!success && contract.status !== 'Firmado' && numPages && (
                <div 
                  className="signature-box"
                  style={{
                    position: 'absolute',
                    left: signaturePos.x,
                    top: signaturePos.y,
                    width: `${sigSize.width}px`,
                    height: `${sigSize.height}px`,
                    border: '2px dashed var(--warning)',
                    background: 'rgba(234, 179, 8, 0.1)',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--warning)',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    userSelect: 'none',
                    touchAction: 'none'
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  <span>Mover área de firma</span>
                  <div style={{ marginTop: '8px', opacity: 0.5 }}>Firma del Representante Legal</div>
                  
                  {/* Handle de redimensionamiento */}
                  <div
                    style={{
                      position: 'absolute',
                      right: '-2px',
                      bottom: '-2px',
                      width: '20px',
                      height: '20px',
                      cursor: 'nwse-resize',
                      background: 'var(--warning)',
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
          </div>
        </div>

        {/* Lado Derecho: Panel de Acción */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            Firma Electrónica
          </h2>
          
          <div style={{ marginTop: '20px', marginBottom: '24px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Empresa Cliente:</p>
            <p style={{ fontSize: '18px', fontWeight: 'bold' }}>{client ? client.empresa : 'Cliente B2B'}</p>
          </div>

          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', marginBottom: '24px' }}>
            <h4 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--text-primary)' }}>Resumen del Acuerdo</h4>
            <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '20px', lineHeight: '1.6' }}>
              <li><strong>Documento:</strong> {contract.title}</li>
              {contract.metadata?.monto > 0 && <li><strong>Monto Total:</strong> ${contract.metadata.monto.toLocaleString('es-AR')}</li>}
              {contract.metadata?.vencimiento && <li><strong>Vigencia hasta:</strong> {contract.metadata.vencimiento}</li>}
              <li><strong>Auditoría B2B:</strong> Trazabilidad IP registrada.</li>
            </ul>
          </div>

          {success || contract.status === 'Firmado' ? (
            <div style={{ textAlign: 'center', marginTop: 'auto', background: 'rgba(34, 197, 94, 0.1)', padding: '24px', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ color: 'var(--success)', marginBottom: '8px' }}>¡Acuerdo Firmado!</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                La firma digital ha sido estampada exitosamente con validación legal y sellado de tiempo.
              </p>
              <button className="btn btn-primary" onClick={handleDownload} style={{ width: '100%', background: 'var(--success)' }}>
                <Download size={16} /> Descargar Copia
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 'auto' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', marginBottom: '16px' }}>
                <input 
                  type="checkbox" 
                  checked={stampAllPages} 
                  onChange={(e) => setStampAllPages(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span style={{ fontWeight: '600' }}>Estampar firma digital en todas las páginas</span>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '20px' }}>
                <input 
                  type="checkbox" 
                  checked={agreed} 
                  onChange={(e) => setAgreed(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span>Declaro que tengo la representación legal y autorizo este acuerdo vinculante con la plataforma DocuMation B2B.</span>
              </label>
              
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', height: '48px', fontSize: '16px', background: 'var(--warning)', fontWeight: 'bold' }}
                disabled={!agreed || signing}
                onClick={handleSign}
              >
                {signing ? 'Estampando Firma...' : 'Firmar Contrato'}
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
