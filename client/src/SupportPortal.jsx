import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './support.css';

async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
  return data;
}

export default function SupportPortal({ theme, onTheme }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('PENDING');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/support/me').then(data => setUser(data.user)).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (user) api('/api/support/orders').then(data => setItems(data.items)).catch(err => setError(err.message)); }, [user]);
  async function login(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api('/api/support/login', 'POST', { username, password }); setUser(result.user); setPassword(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    await api('/api/support/logout', 'POST', {}).catch(() => {});
    setUser(null); setItems([]); setQr(null); setSelected(null);
  }
  async function generateQr() {
    if (!selected || selected.state !== 'PENDING') return;
    if (!window.confirm('Se invalidará el QR anterior de esta OTC. ¿Generar uno nuevo?')) return;
    setBusy(true); setError('');
    try { setQr(await api(`/api/support/orders/${selected.request_uuid}/qr`, 'POST', {})); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!qr) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') setQr(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [qr]);
  async function shareQr() {
    if (!qr) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Conformidad OTC', url: qr.url }); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(qr.url); }
    catch { setError('No se pudo copiar el enlace. Use el QR desde esta pantalla.'); }
  }
  const visible = items.filter(item => (tab === 'PENDING' ? item.state === 'PENDING' : item.state !== 'PENDING') &&
    [item.order_code, item.requester, item.service, item.equipment].join(' ').toLocaleLowerCase('es-PE').includes(query.toLocaleLowerCase('es-PE')));
  return <div className="support-page">
    <div className="environment-bar"><div className="shell environment-inner"><div><span className="status-dot" /><strong>PANEL DE SOPORTE OTC</strong><span className="bar-divider">|</span><span>Hospital de Chancay</span></div><span className="environment-right">ACCESO AUTORIZADO</span></div></div>
    <header className="topbar"><div className="shell topbar-inner"><div className="brand"><span className="brand-mark">⌘</span><div><div className="brand-title"><strong>Hospital de Chancay</strong><span className="brand-tag">OTC / SBS</span></div><small>Oficina de Estadística e Informática · Soporte Técnico</small></div></div><div className="topbar-actions"><button className="theme-button" onClick={onTheme}>☾ Tema</button>{user && <button className="theme-button" onClick={logout}>Salir</button>}</div></div></header>
    {loading ? <main className="shell support-main"><p>Cargando sesión…</p></main> : !user ?
      <main className="shell support-login-wrap"><form className="support-login" onSubmit={login}><span className="support-kicker">ACCESO DEL PERSONAL DE SOPORTE</span><h1>Gestión de OTC</h1><p>Inicia sesión con tu usuario autorizado de Informática. La persona solicitante no necesita una cuenta: accederá únicamente mediante el QR temporal.</p><label>Usuario<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required /></label><label>Contraseña<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <div className="notice error" role="alert">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? 'Verificando…' : 'Entrar al panel'}</button></form></main>
      : <main className="shell support-main"><div className="support-head"><div><span className="support-kicker">ÓRDENES DE TRABAJO CÓMPUTO</span><h1>Gestión de OTC</h1><p>Prepara, revisa y comparte la conformidad de cada intervención.</p></div><div className="support-user"><span className="support-avatar">{user.name?.slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role === 'ADMIN' ? 'Administrador OTC' : 'Técnico de soporte'}</small></div></div></div>
        <div className="support-stats"><div><span>PENDIENTES DE VISADO</span><strong>{items.filter(item => item.state === 'PENDING').length}</strong><small>QR renovable</small></div><div><span>HISTÓRICO</span><strong>{items.filter(item => item.state !== 'PENDING').length}</strong><small>Versiones cerradas</small></div></div>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="support-grid"><section className="support-panel"><span className="support-kicker">BANDEJA DE TRABAJO</span><h2>Mis órdenes</h2><div className="support-tabs"><button className={tab === 'PENDING' ? 'selected' : ''} onClick={() => { setTab('PENDING'); setSelected(null); setQr(null); }}>Pendientes</button><button className={tab === 'HISTORY' ? 'selected' : ''} onClick={() => { setTab('HISTORY'); setSelected(null); setQr(null); }}>Histórico</button></div><input className="support-search" placeholder="Buscar OTC, solicitante o equipo…" value={query} onChange={event => setQuery(event.target.value)} />
          <div className="support-list">{visible.length ? visible.map(item => <button key={item.request_uuid} className={`support-item ${selected?.request_uuid === item.request_uuid ? 'active' : ''}`} onClick={() => { setSelected(item); setQr(null); }}><span><strong>{item.order_code}</strong><em>{item.state === 'PENDING' ? 'Pendiente' : item.state === 'CONFORME' ? 'Conforme' : item.state}</em></span><small>{item.service} · {item.requester}</small><small>{item.equipment}</small></button>) : <p className="support-empty">No hay OTC en esta bandeja. Las órdenes aparecerán al publicarse desde el sistema local.</p>}</div></section>
          <section className="support-panel support-detail">{selected ? <><span className="support-kicker">DETALLE DE LA INTERVENCIÓN · V{selected.version}</span><h2>{selected.order_code}</h2><div className="support-detail-fields"><div><span>SERVICIO</span><strong>{selected.service || '—'}</strong></div><div><span>SOLICITANTE</span><strong>{selected.requester || '—'}</strong></div><div><span>EQUIPO</span><strong>{selected.equipment || '—'}</strong></div><div><span>ESTADO</span><strong>{selected.state === 'PENDING' ? 'Pendiente de visado' : selected.state}</strong></div></div>{selected.state === 'PENDING' && <><p className="support-note">Cada QR nuevo reemplaza al anterior y caduca en tres horas. Comparte el QR solo con quien dará conformidad.</p><button className="primary-button" disabled={busy} onClick={generateQr}>{busy ? 'Generando…' : 'Generar o renovar QR'}</button></>}</> : <div className="support-placeholder"><span>▣</span><h2>Selecciona una OTC</h2><p>Verás su detalle y, si está pendiente, podrás generar el QR de conformidad.</p></div>}</section></div>
      </main>}
    {qr && <div className="support-qr-overlay" role="presentation" onClick={() => setQr(null)}><section className="support-qr-dialog" role="dialog" aria-modal="true" aria-labelledby="support-qr-title" onClick={event => event.stopPropagation()}><button className="support-qr-close" type="button" aria-label="Cerrar QR" onClick={() => setQr(null)}>×</button><span className="support-kicker">ENLACE TEMPORAL DE VISADO</span><h2 id="support-qr-title">QR de conformidad</h2><p className="support-qr-order">{qr.order_code}</p><div className="support-qr-code"><QRCodeSVG value={qr.url} size={224} marginSize={2} /></div><p className="support-qr-expiry">Válido hasta {new Date(qr.expires_at).toLocaleString('es-PE')}</p><p className="support-qr-hint">Muestra este código a quien dará conformidad. Cada QR nuevo invalida el anterior.</p><button className="primary-button" type="button" onClick={shareQr}>Compartir o copiar enlace</button></section></div>}
    <footer className="footer"><div className="shell"><span>Hospital de Chancay y Servicios Básicos de Salud</span><span>Oficina de Estadística e Informática · Área de Soporte Técnico</span></div></footer>
  </div>;
}
