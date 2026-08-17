import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Lock, FileText, UploadCloud, Trash2, LogOut, CheckCircle,
  Clock, TrendingUp, Briefcase, Plus, X, Search, Link, Folder, ArrowLeft, ArrowRight, Download, Settings, Edit, Loader2, Send, Menu
} from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5173' : '';

// ==========================================
// LOGIN COMERCIAL
// ==========================================
export function CommercialLogin({ setView, setCommercialSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/employee/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuilOrEmail: email, password })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Credenciales inválidas');

      if (data.employee.role !== 'admin' && data.employee.role !== 'comercial') {
        throw new Error('No tienes permisos de acceso comercial');
      }

      setCommercialSession({ isLoggedIn: true, user: data.employee });
      setView('commercial');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
      <div className="glass-panel" style={{ maxWidth: '400px', width: '100%', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div className="stat-icon warning" style={{ margin: '0 auto 16px auto', width: '64px', height: '64px' }}>
            <Briefcase size={32} />
          </div>
          <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Acceso Comercial</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Ingresa tus credenciales B2B</p>
        </div>

        {error && <div className="alert-error" style={{ marginBottom: '20px' }}>{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Correo Electrónico</label>
            <input
              type="text"
              className="form-control"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
              required
            />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', background: 'var(--warning)', marginTop: '10px' }} disabled={loading}>
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button className="btn btn-secondary" onClick={() => setView('hub')}>Volver al inicio</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// DASHBOARD COMERCIAL
// ==========================================
export function CommercialDashboard({ session, handleLogout }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'contracts', 'clients'
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [kpis, setKpis] = useState(null);
  const [clients, setClients] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [selectedClientFolder, setSelectedClientFolder] = useState(null);

  // ABM y Configuración
  const [clientsMode, setClientsMode] = useState('repo'); // 'repo', 'abm', 'settings'
  const [fuzzyThreshold, setFuzzyThreshold] = useState(80);
  const [aiProvider, setAiProvider] = useState('groq');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [editClientData, setEditClientData] = useState({ id: null, empresa: '', name: '', email: '' });

  const [commercialUsers, setCommercialUsers] = useState([]);
  const [showCommercialModal, setShowCommercialModal] = useState(false);
  const [editCommercialData, setEditCommercialData] = useState({ id: null, name: '', email: '', password: '' });

  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [editMetadataData, setEditMetadataData] = useState({ id: null, empresa: '', monto: '', duracionMeses: '' });
  // Bulk Delete y Filtros
  const [selectedContracts, setSelectedContracts] = useState([]);
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [reassignContractId, setReassignContractId] = useState(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'uploadedAt', direction: 'desc' });

  const [columns, setColumns] = useState([
    { id: 'title', label: 'Documento', sortKey: 'title' },
    { id: 'clientName', label: 'Cliente', sortKey: 'clientName' },
    { id: 'status', label: 'Estado', sortKey: 'status' },
    { id: 'uploadedAt', label: 'Fecha Alta', sortKey: 'uploadedAt' },
    { id: 'fechaFirmaDocumento', label: 'Firma Documento', sortKey: 'fechaFirmaDocumento' },
    { id: 'vencimiento', label: 'Vigencia', sortKey: 'vencimiento' },
  ]);
  const [draggedColId, setDraggedColId] = useState(null);

  const handleColDragStart = (e, id) => {
    setDraggedColId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColDrop = (e, targetId) => {
    e.preventDefault();
    if (!draggedColId || draggedColId === targetId) return;
    const newCols = [...columns];
    const sourceIdx = newCols.findIndex(c => c.id === draggedColId);
    const targetIdx = newCols.findIndex(c => c.id === targetId);
    const [movedCol] = newCols.splice(sourceIdx, 1);
    newCols.splice(targetIdx, 0, movedCol);
    setColumns(newCols);
    setDraggedColId(null);
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <span style={{ opacity: 0.3, marginLeft: '4px', fontSize: '12px' }}>↕</span>;
    return <span style={{ marginLeft: '4px', color: 'var(--warning)', fontWeight: 'bold' }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const loadData = async () => {
    try {
      const [resKpis, resContracts, resClients, resSettings, resUsers] = await Promise.all([
        fetch(`${API_BASE}/api/commercial/kpis`).then(r => r.json()),
        fetch(`${API_BASE}/api/contracts`).then(r => r.json()),
        fetch(`${API_BASE}/api/clients`).then(r => r.json()),
        fetch(`${API_BASE}/api/commercial/settings`).then(r => r.json()),
        fetch(`${API_BASE}/api/commercial-users`).then(r => r.json())
      ]);
      setKpis(resKpis);
      setContracts(Array.isArray(resContracts) ? resContracts : []);
      setClients(Array.isArray(resClients) ? resClients : []);
      setFuzzyThreshold(resSettings.fuzzyMatchThreshold || 80);
      setAiProvider(resSettings.aiProvider || 'groq');
      setGroqApiKey(resSettings.groqApiKey || '');
      setOpenaiApiKey(resSettings.openaiApiKey || '');
      setCommercialUsers(resUsers || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 1, total: files.length });
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(prev => ({ ...prev, current: i + 1 }));
      if (file.type !== 'application/pdf') continue;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace('.pdf', ''));

      try {
        const res = await fetch(`${API_BASE}/api/contracts/upload`, {
          method: 'POST',
          body: formData
        });

        if (res.status === 409) {
          duplicateCount++;
        } else if (!res.ok) {
          errorCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        errorCount++;
      }
    }

    setUploading(false);
    e.target.value = null; // Reset input
    loadData();

    // Resumen
    if (files.length > 1 || duplicateCount > 0 || errorCount > 0) {
      let msg = `Proceso de subida finalizado.\n\nSubidos con éxito: ${successCount}`;
      if (duplicateCount > 0) msg += `\nDuplicados rechazados: ${duplicateCount}`;
      if (errorCount > 0) msg += `\nErrores: ${errorCount}`;
      alert(msg);
    }
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editClientData)
      });
      if (!res.ok) throw new Error(await res.text());
      setEditClientData({ id: null, empresa: '', name: '', email: '' });
      setShowClientModal(false);
      loadData();
    } catch (err) {
      alert("Error al guardar cliente: " + err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedContracts.length === 0) return;

    const hasSigned = (Array.isArray(contracts) ? contracts : []).some(c => selectedContracts.includes(c.id) && c.status === 'Firmado');
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente ${selectedContracts.length} contrato(s)? Esta acción no se puede deshacer.`)) return;

    if (hasSigned) {
      if (!window.confirm("¡ATENCIÓN CRÍTICA! Estás intentando eliminar contratos que ya están FIRMADOS por el cliente y tienen validez legal. ¿Estás absolutamente seguro de querer proceder?")) return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/contracts/delete-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractIds: selectedContracts })
      });
      if (!res.ok) throw new Error('Error al eliminar contratos en lote');

      const data = await res.json();
      setSelectedContracts([]);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSendBulk = async () => {
    if (selectedContracts.length === 0) {
      alert("Selecciona al menos un contrato usando las casillas de la tabla.");
      return;
    }
    if (!window.confirm(`¿Deseas enviar el enlace de firma por correo a los ${selectedContracts.length} contratos seleccionados?`)) return;

    setIsSendingBulk(true);

    try {
      const res = await fetch(`${API_BASE}/api/contracts/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractIds: selectedContracts })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar de forma masiva');

      let msg = `Proceso de envío finalizado.\n\nEnviados con éxito: ${data.results.sent}\nFallidos: ${data.results.failed}`;
      if (data.results.errors.length > 0) {
        msg += `\n\nErrores detallados:\n- ` + data.results.errors.join('\n- ');
      }
      alert(msg);
      setSelectedContracts([]);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSendingBulk(false);
    }
  };

  const handleSendIndividual = async (contractId) => {
    try {
      const res = await fetch(`${API_BASE}/api/contracts/${contractId}/send`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar');
      alert(`✅ ${data.message}`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteClient = async (id) => {
    if (window.confirm("¿Seguro que deseas eliminar este cliente?")) {
      try {
        const res = await fetch(`${API_BASE}/api/clients/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Error al eliminar");
        }
        loadData();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const handleSaveSettings = async () => {
    try {
      await fetch(`${API_BASE}/api/commercial/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fuzzyMatchThreshold: fuzzyThreshold,
          aiProvider,
          groqApiKey,
          openaiApiKey
        })
      });
      alert("Configuración B2B guardada exitosamente.");
    } catch (err) {
      alert("Error al guardar configuración.");
    }
  };

  const handleSaveCommercial = async (e) => {
    e.preventDefault();
    try {
      const method = editCommercialData.id ? 'PUT' : 'POST';
      const url = editCommercialData.id ? `${API_BASE}/api/commercial-users/${editCommercialData.id}` : `${API_BASE}/api/commercial-users`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editCommercialData)
      });
      if (res.ok) {
        setShowCommercialModal(false);
        loadData();
      } else {
        alert("Error al guardar comercial.");
      }
    } catch (err) {
      alert("Error de conexión.");
    }
  };

  const handleDeleteCommercial = async (id) => {
    if (!window.confirm("¿Seguro de eliminar a este usuario comercial?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/commercial-users/${id}`, { method: 'DELETE' });
      if (res.ok) loadData();
    } catch (err) {
      alert("Error al eliminar comercial.");
    }
  };

  const handleSaveMetadata = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/contracts/${editMetadataData.id}/metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editMetadataData)
      });
      if (res.ok) {
        setShowMetadataModal(false);
        loadData();
      } else {
        alert("Error al guardar metadatos.");
      }
    } catch (err) {
      alert("Error de conexión.");
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const safeContracts = Array.isArray(contracts) ? contracts : [];
  const filteredContracts = safeContracts.filter(c => {
    if (filterClient && filterClient === 'Sin Asignar' && c.clientId) return false;
    if (filterClient && filterClient !== 'Sin Asignar' && c.clientId !== filterClient) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterSearch && !(c.title || '').toLowerCase().includes((filterSearch || '').toLowerCase())) return false;
    return true;
  });
  const sortedContracts = [...filteredContracts].sort((a, b) => {
    let valA = a[sortConfig.key];
    let valB = b[sortConfig.key];

    // Manejar sub-objetos y casos especiales
    if (sortConfig.key === 'fechaFirmaDocumento' || sortConfig.key === 'vencimiento') {
      valA = a.metadata?.[sortConfig.key] || '';
      valB = b.metadata?.[sortConfig.key] || '';
    } else if (sortConfig.key === 'clientName') {
      const clientA = (Array.isArray(clients) ? clients : []).find(cl => cl.id === a.clientId);
      const clientB = (Array.isArray(clients) ? clients : []).find(cl => cl.id === b.clientId);
      valA = clientA ? clientA.empresa.toLowerCase() : 'sin asignar';
      valB = clientB ? clientB.empresa.toLowerCase() : 'sin asignar';
    } else if (sortConfig.key === 'title') {
      valA = (valA || '').toLowerCase();
      valB = (valB || '').toLowerCase();
    }

    // Evitar errores si undefined
    if (valA === undefined || valA === null) valA = '';
    if (valB === undefined || valB === null) valB = '';

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const isAllVisibleSelected = sortedContracts.length > 0 && sortedContracts.every(c => selectedContracts.includes(c.id));

  return (
    <>
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="logo-container">
          <div className="logo-icon" style={{ borderRadius: '50%', background: 'var(--warning)', color: '#fff', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>C</div>
          <span className="logo-text" style={{ fontFamily: 'var(--font-title)', fontSize: '20px', fontWeight: '800' }}>
            <span style={{ color: 'var(--primary)' }}>e-</span>
            <span style={{ color: '#fff' }}>ABC</span>
            <span style={{ color: 'var(--warning)', fontSize: '14px', marginLeft: '6px', fontWeight: 'bold' }}>B2B Portal</span>
          </span>
        </div>

        <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}><Menu size={24} /></button>
        <div className={"nav-links" + (isMobileMenuOpen ? " open" : "")} onClick={() => setIsMobileMenuOpen(false)}>
          <button
            className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <TrendingUp size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Resumen de Ventas
          </button>
          <button
            className={`nav-link ${activeTab === 'contracts' ? 'active' : ''}`}
            onClick={() => setActiveTab('contracts')}
          >
            <FileText size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Contratos
          </button>
          <button
            className={`nav-link ${activeTab === 'clients' ? 'active' : ''}`}
            onClick={() => setActiveTab('clients')}
          >
            <Users size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Clientes
          </button>
          <button
            className={`nav-link ${activeTab === 'commercials' ? 'active' : ''}`}
            onClick={() => setActiveTab('commercials')}
          >
            <Briefcase size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Comerciales
          </button>
          <button
            className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Configuración
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', marginRight: '4px', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px', height: '24px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Hola, <strong style={{ color: 'var(--text-primary)' }}>{session?.user?.name}</strong>
            </span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '8px',
              background: 'rgba(234, 179, 8, 0.15)',
              color: 'var(--warning)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              fontWeight: '600'
            }}>
              Ejecutivo de Ventas
            </span>
            <button
              className="btn btn-secondary"
              onClick={handleLogout}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginLeft: '8px',
                background: 'rgba(255,255,255,0.05)'
              }}
              title="Cerrar Sesión B2B"
            >
              <LogOut size={12} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="dashboard-content" style={{ padding: '24px 40px' }}>
        {activeTab === 'dashboard' && kpis && (
          <div className="fade-in">
            <h2 className="section-title">Pipeline y KPIs Comerciales</h2>

            <div className="stats-grid">
              <div className="stat-card glass-panel">
                <div className="stat-header">
                  <span className="stat-title">Valor Pipeline Activo</span>
                  <div className="stat-icon warning"><TrendingUp size={20} /></div>
                </div>
                <div className="stat-value">${kpis.pipelineTotal.toLocaleString('es-AR')}</div>
                <div className="stat-desc">Contratos vigentes (Monto extraído por IA)</div>
              </div>
              <div className="stat-card glass-panel">
                <div className="stat-header">
                  <span className="stat-title">Tasa de Conversión</span>
                  <div className="stat-icon success"><CheckCircle size={20} /></div>
                </div>
                <div className="stat-value">{kpis.conversionRate}%</div>
                <div className="stat-desc">{kpis.activeContracts} firmados de {kpis.totalContracts} enviados</div>
              </div>
              <div className="stat-card glass-panel">
                <div className="stat-header">
                  <span className="stat-title">Contratos Pendientes</span>
                  <div className="stat-icon primary"><Clock size={20} /></div>
                </div>
                <div className="stat-value">{kpis.pendingContracts}</div>
                <div className="stat-desc">A la espera de la firma del cliente</div>
              </div>
              <div className="stat-card glass-panel">
                <div className="stat-header">
                  <span className="stat-title">Clientes Únicos</span>
                  <div className="stat-icon secondary"><Users size={20} /></div>
                </div>
                <div className="stat-value">{kpis.totalClients}</div>
                <div className="stat-desc">Empresas en cartera</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginTop: '24px' }}>
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Top Clientes (Pareto)</h3>
                {kpis.topClients.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No hay datos de montos aún. La IA extraerá los montos cuando subas contratos.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>Cant. Contratos</th>
                        <th style={{ textAlign: 'right' }}>Monto Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpis.topClients.map((tc, idx) => (
                        <tr key={idx}>
                          <td><strong>{tc.name}</strong></td>
                          <td>{tc.contractCount}</td>
                          <td style={{ textAlign: 'right', color: 'var(--warning)', fontWeight: 'bold' }}>
                            ${tc.totalAmount.toLocaleString('es-AR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'contracts' && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 className="section-title" style={{ margin: 0 }}>Gestión de Contratos</h2>

              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="file"
                  id="contract-upload-input"
                  accept="application/pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <input
                  type="file"
                  id="contract-folder-upload-input"
                  accept="application/pdf"
                  webkitdirectory="true"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <button
                  className="btn btn-icon"
                  style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  onClick={() => document.getElementById('contract-folder-upload-input').click()}
                  disabled={uploading}
                  title="Subir Carpeta (Lote)"
                >
                  <Folder size={16} /> Carpeta
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: 'var(--warning)' }}
                  onClick={() => document.getElementById('contract-upload-input').click()}
                  disabled={uploading}
                >
                  <Plus size={16} /> {uploading ? 'Subiendo...' : 'Nuevos Contratos'}
                </button>
              </div>
            </div>

            {/* Action Bar & Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
                <input
                  type="text"
                  placeholder="Buscar por título..."
                  className="input-field"
                  style={{ maxWidth: '250px' }}
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
                <select
                  className="input-field"
                  style={{ maxWidth: '200px' }}
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                >
                  <option value="">Todos los Clientes</option>
                  <option value="Sin Asignar">Sin Asignar</option>
                  {(Array.isArray(clients) ? clients : []).map(cl => (
                    <option key={cl.id} value={cl.id}>{cl.empresa}</option>
                  ))}
                </select>
                <select
                  className="input-field"
                  style={{ maxWidth: '180px' }}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="">Todos los Estados</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Firmado">Firmado</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: selectedContracts.length > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)', padding: '8px 16px', borderRadius: '8px', border: selectedContracts.length > 0 ? '1px solid var(--danger)' : '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontWeight: 'bold', color: selectedContracts.length > 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>{selectedContracts.length} seleccionados</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" style={{ background: 'var(--warning)', color: '#000', opacity: selectedContracts.length === 0 ? 0.5 : 1 }} onClick={handleSendBulk} disabled={isSendingBulk}>
                    {isSendingBulk ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                    {isSendingBulk ? 'Enviando...' : 'Envío Masivo'}
                  </button>
                  <button className="btn btn-primary" style={{ background: 'var(--danger)', opacity: selectedContracts.length === 0 ? 0.5 : 1 }} onClick={handleBulkDelete} disabled={selectedContracts.length === 0}>
                    <Trash2 size={16} /> Borrar Selección
                  </button>
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isAllVisibleSelected}
                        onChange={() => {
                          if (isAllVisibleSelected) {
                            const visibleIds = filteredContracts.map(c => c.id);
                            setSelectedContracts(selectedContracts.filter(id => !visibleIds.includes(id)));
                          } else {
                            const newSelected = new Set([...selectedContracts, ...filteredContracts.map(c => c.id)]);
                            setSelectedContracts(Array.from(newSelected));
                          }
                        }}
                      />
                    </th>
                    {columns.map(col => (
                      <th
                        key={col.id}
                        draggable
                        onDragStart={(e) => handleColDragStart(e, col.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleColDrop(e, col.id)}
                        onDragEnd={() => setDraggedColId(null)}
                        style={{ cursor: 'grab', opacity: draggedColId === col.id ? 0.5 : 1 }}
                        onClick={() => handleSort(col.sortKey)}
                        title="Arrastra para reordenar, clic para ordenar"
                      >
                        {col.label} {getSortIcon(col.sortKey)}
                      </th>
                    ))}
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedContracts.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        No hay contratos que coincidan con los filtros.
                      </td>
                    </tr>
                  ) : sortedContracts.map(c => {
                    const client = (Array.isArray(clients) ? clients : []).find(cl => cl.id === c.clientId);
                    return (
                      <tr key={c.id} style={{ backgroundColor: selectedContracts.includes(c.id) ? 'rgba(234, 179, 8, 0.15)' : (c.status === 'Firmado' ? 'rgba(76, 175, 80, 0.05)' : 'rgba(255, 193, 7, 0.05)') }}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedContracts.includes(c.id)}
                            onChange={() => {
                              if (selectedContracts.includes(c.id)) {
                                setSelectedContracts(selectedContracts.filter(id => id !== c.id));
                              } else {
                                setSelectedContracts([...selectedContracts, c.id]);
                              }
                            }}
                          />
                        </td>
                        {columns.map(col => {
                          let content = null;
                          switch (col.id) {
                            case 'title': content = <strong>{c.title}</strong>; break;
                            case 'clientName': content = client ? client.empresa : 'Sin Asignar'; break;
                            case 'status': content = <span className={`status-badge ${c.status === 'Firmado' ? 'success' : 'pending'}`}>{c.status}</span>; break;
                            case 'uploadedAt': content = c.uploadedAt ? new Date(c.uploadedAt).toLocaleDateString() : 'Sin fecha'; break;
                            case 'fechaFirmaDocumento':
                              content = c.status === 'Firmado' && c.metadata?.fechaFirmaDocumento
                                ? new Date(c.metadata.fechaFirmaDocumento).toLocaleDateString()
                                : <span style={{ color: 'var(--text-secondary)' }}>A la espera de firma</span>;
                              break;
                            case 'vencimiento':
                              if (c.status === 'Firmado' && c.metadata?.vencimiento) {
                                content = <span style={{ color: 'var(--warning)', fontWeight: '500' }}>{new Date(c.metadata.vencimiento).toLocaleDateString()}</span>;
                              } else if (c.status !== 'Firmado') {
                                if (c.metadata?.fechaVencimientoExplicita) {
                                  content = <span style={{ color: 'var(--warning)' }}>Fija: {new Date(c.metadata.fechaVencimientoExplicita).toLocaleDateString()}</span>;
                                } else if (c.metadata?.duracionMeses) {
                                  content = <span style={{ color: 'var(--text-secondary)' }}>{c.metadata.duracionMeses} meses (post-firma)</span>;
                                } else if (c.metadata?.vencimiento) {
                                  // Retrocompatibilidad con contratos procesados por el modelo viejo de IA
                                  content = <span style={{ color: 'var(--warning)' }}>{new Date(c.metadata.vencimiento).toLocaleDateString()}</span>;
                                } else {
                                  content = <span style={{ color: 'var(--text-secondary)' }}>A calcular tras firma</span>;
                                }
                              } else {
                                content = <span style={{ color: 'var(--text-secondary)' }}>No estipulado en contrato</span>;
                              }
                              break;
                            default: content = null;
                          }
                          return <td key={col.id}>{content}</td>;
                        })}
                        <td style={{ display: 'flex', gap: '8px' }}>
                          {c.status === 'Firmado' && (
                            <a
                              href={`${API_BASE}/api/contracts/pdf/${c.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-icon"
                              title="Descargar PDF Firmado"
                              style={{ color: 'var(--success)' }}
                            >
                              <Download size={16} />
                            </a>
                          )}
                          <button
                            className="btn btn-icon"
                            title="Reasignar Cliente"
                            style={{ color: 'var(--secondary)' }}
                            onClick={() => setReassignContractId(c.id)}
                          >
                            <Edit size={16} />
                          </button>
                          {c.status === 'Pendiente' && (
                            <button
                              className="btn btn-icon"
                              title="Editar Metadatos de IA"
                              style={{ color: 'var(--primary)' }}
                              onClick={() => {
                                setEditMetadataData({
                                  id: c.id,
                                  empresa: c.metadata?.empresa || '',
                                  monto: c.metadata?.monto || '',
                                  duracionMeses: c.metadata?.duracionMeses || ''
                                });
                                setShowMetadataModal(true);
                              }}
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          <button
                            className="btn btn-icon"
                            title="Enviar por Correo"
                            style={{ color: 'var(--warning)' }}
                            onClick={() => handleSendIndividual(c.id)}
                            disabled={c.status === 'Firmado'}
                          >
                            <Send size={16} />
                          </button>
                          <button
                            className="btn btn-icon"
                            title="Copiar Link Cliente"
                            onClick={() => {
                              const link = `${window.location.origin}/#b2b-portal?token=${c.token}`;
                              navigator.clipboard.writeText(link);
                              alert('¡Enlace seguro copiado al portapapeles!');
                            }}
                          >
                            <Link size={16} />
                          </button>
                          <button
                            className="btn btn-icon"
                            title="Eliminar Contrato"
                            style={{ color: 'var(--danger)' }}
                            onClick={async () => {
                              if (!window.confirm("¿Seguro que deseas eliminar este contrato individualmente?")) return;
                              if (c.status === 'Firmado') {
                                if (!window.confirm("¡ATENCIÓN CRÍTICA! Este contrato ya está FIRMADO por el cliente y tiene validez legal. ¿Estás absolutamente seguro de borrarlo?")) return;
                              }
                              try {
                                const res = await fetch(`${API_BASE}/api/contracts/delete-bulk`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ contractIds: [c.id] })
                                });
                                if (!res.ok) throw new Error('Error al eliminar');
                                setSelectedContracts(selectedContracts.filter(id => id !== c.id));
                                loadData();
                              } catch (err) {
                                alert(err.message);
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="fade-in">
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
              <button
                className={`btn ${clientsMode === 'repo' ? 'btn-primary' : 'btn-icon'}`}
                onClick={() => { setClientsMode('repo'); setSelectedClientFolder(null); }}
                style={{ borderRadius: '4px 4px 0 0', padding: '10px 20px', borderBottom: clientsMode === 'repo' ? 'none' : '' }}
              >
                <Folder size={16} /> Repositorio
              </button>
              <button
                className={`btn ${clientsMode === 'abm' ? 'btn-primary' : 'btn-icon'}`}
                onClick={() => setClientsMode('abm')}
                style={{ borderRadius: '4px 4px 0 0', padding: '10px 20px', borderBottom: clientsMode === 'abm' ? 'none' : '' }}
              >
                <Users size={16} /> Base de Datos
              </button>
            </div>

            {clientsMode === 'repo' && (
              !selectedClientFolder ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
                    {clients.map(client => {
                      const clientContracts = contracts.filter(c => c.clientId === client.id);

                      const vigentes = clientContracts.filter(c => c.status === 'Firmado' && (!c.metadata?.vencimiento || new Date(c.metadata.vencimiento) >= new Date())).length;
                      const vencidos = clientContracts.filter(c => c.status === 'Firmado' && c.metadata?.vencimiento && new Date(c.metadata.vencimiento) < new Date()).length;
                      const pendientes = clientContracts.filter(c => c.status !== 'Firmado').length;
                      const firmados = clientContracts.filter(c => c.status === 'Firmado').length;

                      return (
                        <div
                          key={client.id}
                          className="glass-panel"
                          style={{ padding: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '15px', transition: 'all 0.2s' }}
                          onClick={() => setSelectedClientFolder(client)}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Folder size={32} color="var(--secondary)" />
                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{client.empresa}</h3>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem' }}>
                            <div style={{ background: 'rgba(76, 175, 80, 0.1)', color: 'var(--success)', padding: '6px 8px', borderRadius: '4px', textAlign: 'center' }}>Vigentes: <strong>{vigentes}</strong></div>
                            <div style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', padding: '6px 8px', borderRadius: '4px', textAlign: 'center' }}>Firmados: <strong>{firmados}</strong></div>
                            <div style={{ background: 'rgba(234, 179, 8, 0.1)', color: 'var(--warning)', padding: '6px 8px', borderRadius: '4px', textAlign: 'center' }}>Pendientes: <strong>{pendientes}</strong></div>
                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '6px 8px', borderRadius: '4px', textAlign: 'center' }}>Vencidos: <strong>{vencidos}</strong></div>
                          </div>
                        </div>
                      );
                    })}
                    {clients.length === 0 && (
                      <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>No hay empresas registradas aún.</div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                    <button className="btn btn-icon" onClick={() => setSelectedClientFolder(null)}>
                      <ArrowLeft size={20} />
                    </button>
                    <h2 className="section-title" style={{ margin: 0 }}>
                      <Folder size={24} style={{ display: 'inline', marginRight: '10px', verticalAlign: 'middle', color: 'var(--secondary)' }} />
                      {selectedClientFolder.empresa}
                    </h2>
                  </div>

                  <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Documento</th>
                          <th>Estado</th>
                          <th>Fecha de Subida</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contracts.filter(c => c.clientId === selectedClientFolder.id).map(c => (
                          <tr key={c.id} style={{ backgroundColor: c.status === 'Firmado' ? 'rgba(76, 175, 80, 0.05)' : 'rgba(255, 193, 7, 0.05)' }}>
                            <td><strong>{c.title}</strong></td>
                            <td>
                              <span className={`status-badge ${c.status === 'Firmado' ? 'success' : 'pending'}`}>
                                {c.status}
                              </span>
                            </td>
                            <td>{new Date(c.uploadedAt).toLocaleDateString()}</td>
                            <td>
                              <a
                                href={`${API_BASE}/api/contracts/pdf/${c.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-primary"
                                style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <Download size={14} /> Descargar PDF
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            )}

            {clientsMode === 'abm' && (
              <div className="fade-in">
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => { setEditClientData({ id: null, empresa: '', name: '', email: '' }); setShowClientModal(true); }}
                  >
                    <Plus size={16} /> Nuevo Cliente
                  </button>
                </div>
                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>Contacto</th>
                        <th>Email</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map(client => (
                        <tr key={client.id}>
                          <td><strong>{client.empresa}</strong></td>
                          <td>{client.name}</td>
                          <td>{client.email}</td>
                          <td style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-icon" title="Editar" onClick={() => { setEditClientData(client); setShowClientModal(true); }}>
                              <Edit size={16} />
                            </button>
                            <button className="btn btn-icon" title="Eliminar" onClick={() => handleDeleteClient(client.id)}>
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {activeTab === 'commercials' && (
          <div className="fade-in glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 className="section-title" style={{ margin: 0 }}>Usuarios Comerciales</h2>
              <button className="btn btn-primary" onClick={() => { setEditCommercialData({ id: null, name: '', email: '', password: '' }); setShowCommercialModal(true); }}>
                <Plus size={16} /> Nuevo Comercial
              </button>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {commercialUsers.length === 0 ? (
                    <tr><td colSpan="3" style={{ textAlign: 'center' }}>No hay usuarios comerciales.</td></tr>
                  ) : commercialUsers.map(user => (
                    <tr key={user.id}>
                      <td><strong>{user.name}</strong></td>
                      <td>{user.email}</td>
                      <td style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-icon" title="Editar" onClick={() => { setEditCommercialData({ id: user.id, name: user.name, email: user.email, password: '' }); setShowCommercialModal(true); }}>
                          <Edit size={16} />
                        </button>
                        <button className="btn btn-icon" title="Eliminar" onClick={() => handleDeleteCommercial(user.id)}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="fade-in glass-panel" style={{ padding: '30px', maxWidth: '800px', margin: '0 auto' }}>
            <h2 className="section-title">Configuración B2B</h2>

            <div style={{ marginBottom: '30px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
              <h3 style={{ marginTop: 0 }}>Configuración de IA (Extracción de Contratos)</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Selecciona el proveedor de Inteligencia Artificial y configura las API Keys correspondientes.</p>

              <div className="form-group" style={{ marginTop: '15px' }}>
                <label>Proveedor de IA Activo</label>
                <select className="form-control" value={aiProvider} onChange={e => setAiProvider(e.target.value)}>
                  <option value="groq">Groq (Recomendado, Llama 3)</option>
                  <option value="openai">OpenAI (ChatGPT)</option>
                </select>
              </div>

              {aiProvider === 'groq' && (
                <div className="form-group">
                  <label>Groq API Key</label>
                  <input type="password" value={groqApiKey} onChange={e => setGroqApiKey(e.target.value)} className="form-control" placeholder="gsk_..." />
                </div>
              )}

              {aiProvider === 'openai' && (
                <div className="form-group">
                  <label>OpenAI API Key</label>
                  <input type="password" value={openaiApiKey} onChange={e => setOpenaiApiKey(e.target.value)} className="form-control" placeholder="sk-..." />
                </div>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ marginTop: 0 }}>Auto-Vinculación (Fuzzy Matching)</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Define el nivel de coincidencia requerido (umbral) para que la IA asocie automáticamente un contrato a un cliente existente basándose en el nombre de la empresa.</p>
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontWeight: 'bold' }}>Umbral de Coincidencia: {fuzzyThreshold}%</label>
                <input
                  type="range"
                  min="50" max="100"
                  value={fuzzyThreshold}
                  onChange={(e) => setFuzzyThreshold(e.target.value)}
                  style={{ width: '100%' }}
                />
                <small style={{ color: 'var(--text-secondary)' }}>100% = Coincidencia exacta estricta. 80% = Recomendado para variaciones (Ej. "GlobalTech Corp" vs "GlobalTech").</small>
              </div>
            </div>

            <button className="btn btn-primary" style={{ marginTop: '10px' }} onClick={handleSaveSettings}>
              Guardar Configuración
            </button>
          </div>
        )}
      </main>

      {/* Modal ABM Clientes */}
      {showClientModal && (
        <div className="modal-overlay" onClick={() => setShowClientModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowClientModal(false)}><X size={20} /></button>
            <h2 className="modal-title">{editClientData.id ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
            <form onSubmit={handleSaveClient}>
              <div className="form-group">
                <label>Razón Social / Empresa</label>
                <input
                  type="text"
                  value={editClientData.empresa}
                  onChange={e => setEditClientData({ ...editClientData, empresa: e.target.value })}
                  required
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>Nombre del Contacto</label>
                <input
                  type="text"
                  value={editClientData.name}
                  onChange={e => setEditClientData({ ...editClientData, name: e.target.value })}
                  required
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>Correo Electrónico</label>
                <input
                  type="email"
                  value={editClientData.email}
                  onChange={e => setEditClientData({ ...editClientData, email: e.target.value })}
                  required
                  className="form-control"
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                Guardar Cliente
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Overlay de Subida con Spinner Animado */}
      {uploading && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff'
        }}>
          <div style={{ animation: 'spin 2s linear infinite', marginBottom: '24px' }}>
            <Loader2 size={64} color="var(--warning)" />
          </div>
          <h2 style={{ fontSize: '24px', margin: '0 0 12px 0', fontFamily: 'var(--font-title)' }}>Procesando contratos con IA...</h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.7)', margin: '0 0 24px 0' }}>
            Por favor, no cierres esta ventana. Documento {uploadProgress.current} de {uploadProgress.total}
          </p>
          <div style={{ width: '300px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'var(--warning)',
              width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
          <style>{`
            @keyframes spin { 100% { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}

      {/* Modal Reasignar Cliente */}
      {reassignContractId && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit size={20} color="var(--secondary)" /> Reasignar Cliente
              </h2>
              <button className="btn btn-icon" onClick={() => setReassignContractId(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                Selecciona la empresa correcta a la que pertenece este contrato:
              </p>
              <select
                id="reassign-select"
                className="input-field"
                style={{ width: '100%', marginBottom: '15px', padding: '10px' }}
                defaultValue={contracts.find(c => c.id === reassignContractId)?.clientId || ''}
              >
                <option value="">-- Selecciona un cliente --</option>
                {clients.map(cl => (
                  <option key={cl.id} value={cl.id}>{cl.empresa}</option>
                ))}
              </select>

              <div style={{ padding: '10px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px', marginBottom: '20px', borderLeft: '3px solid var(--secondary)' }}>
                <p style={{ fontSize: '12px', margin: 0, color: 'var(--text-secondary)' }}>
                  <strong>¿No encuentras al cliente?</strong> Recuerda que el ABM completo está disponible en la pestaña superior <strong>"Base de Datos"</strong>, donde puedes dar de alta nuevas empresas antes de reasignarlas.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button className="btn btn-secondary" onClick={() => setReassignContractId(null)}>Cancelar</button>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    const selectEl = document.getElementById('reassign-select');
                    const newClientId = selectEl.value;
                    if (!newClientId) {
                      alert("Debes seleccionar un cliente válido.");
                      return;
                    }
                    try {
                      const res = await fetch(`${API_BASE}/api/contracts/${reassignContractId}/reassign`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newClientId })
                      });
                      if (!res.ok) throw new Error("Error al reasignar el contrato.");
                      setReassignContractId(null);
                      loadData();
                    } catch (err) {
                      alert(err.message);
                    }
                  }}
                >
                  Confirmar Reasignación
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal ABM Comerciales */}
      {showCommercialModal && (
        <div className="modal-overlay" onClick={() => setShowCommercialModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCommercialModal(false)}><X size={20} /></button>
            <h2 className="modal-title">{editCommercialData.id ? 'Editar Comercial' : 'Nuevo Comercial'}</h2>
            <form onSubmit={handleSaveCommercial}>
              <div className="form-group">
                <label>Nombre</label>
                <input
                  type="text"
                  value={editCommercialData.name}
                  onChange={e => setEditCommercialData({ ...editCommercialData, name: e.target.value })}
                  required
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>Email (Usuario)</label>
                <input
                  type="email"
                  value={editCommercialData.email}
                  onChange={e => setEditCommercialData({ ...editCommercialData, email: e.target.value })}
                  required
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>{editCommercialData.id ? 'Nueva Contraseña (opcional)' : 'Contraseña'}</label>
                <input
                  type="password"
                  value={editCommercialData.password}
                  onChange={e => setEditCommercialData({ ...editCommercialData, password: e.target.value })}
                  required={!editCommercialData.id}
                  className="form-control"
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                Guardar Usuario Comercial
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edición de Metadatos de IA */}
      {showMetadataModal && (
        <div className="modal-overlay" onClick={() => setShowMetadataModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowMetadataModal(false)}><X size={20} /></button>
            <h2 className="modal-title">Editar Metadatos del Contrato</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              Los siguientes datos fueron detectados por la Inteligencia Artificial. Puedes ajustarlos antes de enviar el contrato a firma.
            </p>
            <form onSubmit={handleSaveMetadata}>
              <div className="form-group">
                <label>Empresa Detectada</label>
                <input
                  type="text"
                  value={editMetadataData.empresa}
                  onChange={e => setEditMetadataData({ ...editMetadataData, empresa: e.target.value })}
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>Monto del Contrato</label>
                <input
                  type="number"
                  value={editMetadataData.monto}
                  onChange={e => setEditMetadataData({ ...editMetadataData, monto: e.target.value })}
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>Duración Estipulada (Meses)</label>
                <input
                  type="number"
                  value={editMetadataData.duracionMeses}
                  onChange={e => setEditMetadataData({ ...editMetadataData, duracionMeses: e.target.value })}
                  className="form-control"
                  placeholder="Ej: 12"
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                Guardar Metadatos
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
