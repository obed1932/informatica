import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../public/assets/app.css';
import './extra.css';
import SupportPortal from './SupportPortal.jsx';

const fields = [['Denominación', 'denominacion'], ['Marca', 'marca'], ['Modelo', 'modelo'], ['Serie', 'serie'], ['Código de cómputo', 'codigo_patrimonial'], ['Nombre en red', 'hostname']];
const Icon = ({ name }) => <span className={`icon icon-${name}`} aria-hidden="true" />;
const show = value => value == null || value === '' ? '—' : String(value);
function dateText(value) {
  if (!value) return '—';
  const normalized = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}-05:00` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(parsed);
}
async function post(path, payload) {
  const response = await fetch(path, { method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}

function Signature({ onChange, clearSignal, theme }) {
  const canvas = useRef(null);
  const strokes = useRef([]);
  const active = useRef(null);
  const paint = useCallback((target, width, height, color) => {
    target.lineCap = 'round'; target.lineJoin = 'round'; target.lineWidth = 2.4; target.strokeStyle = color;
    for (const points of strokes.current) {
      if (!points.length) continue;
      target.beginPath(); target.moveTo(points[0][0] * width, points[0][1] * height);
      if (points.length === 1) target.lineTo(points[0][0] * width + 0.1, points[0][1] * height + 0.1);
      for (const point of points.slice(1)) target.lineTo(point[0] * width, point[1] * height);
      target.stroke();
    }
  }, []);
  const redraw = useCallback(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = window.devicePixelRatio || 1;
    const width = element.clientWidth, height = element.clientHeight;
    element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
    const ctx = element.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint(ctx, width, height, theme === 'dark' ? '#e0fbe9' : '#153c4c');
  }, [paint, theme]);
  useEffect(() => {
    redraw();
    const observer = new ResizeObserver(redraw); if (canvas.current) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [redraw]);
  useEffect(() => { strokes.current = []; onChange(false); redraw(); }, [clearSignal]);
  const point = event => { const box = canvas.current.getBoundingClientRect(); return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height]; };
  const down = event => { event.currentTarget.setPointerCapture(event.pointerId); active.current = [point(event)]; strokes.current.push(active.current); onChange(true); redraw(); };
  const move = event => { if (active.current) { active.current.push(point(event)); redraw(); } };
  const up = event => { if (active.current && event.type === 'pointerup') active.current.push(point(event)); active.current = null; redraw(); };
  Signature.exportPng = () => {
    const source = canvas.current, output = document.createElement('canvas');
    output.width = source.width; output.height = source.height;
    const ctx = output.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, output.width, output.height);
    ctx.setTransform(output.width / source.clientWidth, 0, 0, output.height / source.clientHeight, 0, 0);
    paint(ctx, source.clientWidth, source.clientHeight, '#153c4c');
    return output.toDataURL('image/png').split(',')[1];
  };
  return <canvas ref={canvas} id="signature" aria-label="Área para dibujar la firma" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />;
}

function Landing({ theme, onTheme }) {
  return <>
    <div className="environment-bar"><div className="shell environment-inner"><div><span className="status-dot" /><strong>HOSPITAL DE CHANCAY · OTC</strong></div><span className="environment-right">PORTAL DE CONFORMIDAD</span></div></div>
    <header className="topbar"><div className="shell topbar-inner"><div className="brand"><span className="brand-mark"><Icon name="hospital" /></span><div><div className="brand-title"><strong>Hospital de Chancay</strong><span className="brand-tag">OTC / SBS</span></div><small>Oficina de Estadística e Informática · Soporte Técnico</small></div></div><button className="theme-button" onClick={onTheme} aria-label="Cambiar tema"><Icon name="moon" /><span>Tema</span></button></div></header>
    <main className="shell landing-main"><div className="landing-card"><span className="reference-chip"><Icon name="shield-check" /> ACCESO TEMPORAL POR QR</span><h1>Conformidad de órdenes de trabajo</h1><p>Para revisar y visar una intervención técnica, abre el enlace personal que figura en el código QR entregado por el personal de Informática.</p><div className="landing-instruction"><Icon name="lock" /><span>Este portal no muestra órdenes sin un enlace vigente. Si tu QR caducó, solicita uno nuevo al técnico responsable.</span></div><small>El visado se registra únicamente después de revisar la orden y confirmar tu firma manuscrita.</small></div></main>
    <footer className="footer"><div className="shell"><span>Hospital de Chancay y Servicios Básicos de Salud</span><span>Área de Soporte Técnico</span></div></footer>
  </>;
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('otc-theme-v2') || 'dark');
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState({ text: 'Cargando la orden…', kind: '' });
  const [thirdParty, setThirdParty] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [signed, setSigned] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [observe, setObserve] = useState(false);
  const requestId = location.pathname.match(/^\/conformidad\/([0-9a-f-]{36})\/?$/i)?.[1];
  const token = useRef(null);
  if (token.current === null) {
    token.current = new URLSearchParams(location.hash.replace(/^#/, '')).get('token') || new URLSearchParams(location.search).get('token') || '';
    if (token.current) history.replaceState(null, '', location.pathname);
  }
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('otc-theme-v2', theme); }, [theme]);
  useEffect(() => {
    if (!requestId || !token.current) { setNotice({ text: 'El enlace de visado está incompleto. Solicita un nuevo QR al área de Informática.', kind: 'error' }); return; }
    let active = true;
    post('/api/request', { request_uuid: requestId, token: token.current }).then(result => {
      if (!active) return;
      setData(result);
      setNotice(result.state === 'PENDING' ? null : { text: result.state === 'CONFORME' ? 'Este visado ya fue registrado. La sincronización y el PDF se procesan en el sistema local.' : 'El plazo de visado terminó o la solicitud fue cerrada.', kind: result.state === 'CONFORME' ? 'success' : 'error' });
    }).catch(error => { if (active) setNotice({ text: error.message, kind: 'error' }); });
    return () => { active = false; };
  }, [requestId]);
  const cleanName = signerName.trim().replace(/\s+/g, ' ');
  const validName = !thirdParty || (/^[\p{L}\p{M}][\p{L}\p{M} .'-]{3,199}$/u.test(cleanName) && cleanName.split(' ').length >= 2 && cleanName.toLocaleLowerCase('es-PE') !== String(data?.requester || '').trim().toLocaleLowerCase('es-PE'));
  const canSubmit = data?.state === 'PENDING' && signed && accepted && validName && !busy;
  async function submit() {
    if (!canSubmit || !window.confirm(`¿Confirmas que ${thirdParty ? cleanName : data.requester} revisó el trabajo descrito y que esta es su firma?`)) return;
    setBusy(true);
    try {
      const result = await post('/api/conform', { request_uuid: requestId, token: token.current, accepted: true,
        signer_is_third_party: thirdParty, signer_name: thirdParty ? cleanName : null, signature_png_base64: Signature.exportPng() });
      setData(previous => ({ ...previous, state: result.state }));
      setNotice({ text: 'Tu conformidad quedó registrada en el hosting. La entrega al sistema local puede tardar; aún no se ha generado el PDF definitivo.', kind: 'success' });
      token.current = '';
    } catch (error) { setNotice({ text: error.message, kind: 'error' }); }
    finally { setBusy(false); }
  }
  const pending = data?.state === 'PENDING';
  if (location.pathname === '/' || location.pathname === '/soporte') return <SupportPortal theme={theme} onTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />;
  return <>
    <div className="environment-bar"><div className="shell environment-inner"><div><span className="status-dot" /><strong>ENLACE PERSONAL DE VISADO</strong><span className="bar-divider">|</span><span>Orden de trabajo de cómputo</span></div><span className="environment-right">ACCESO TEMPORAL · HOSPITAL DE CHANCAY</span></div></div>
    <header className="topbar"><div className="shell topbar-inner"><div className="brand"><span className="brand-mark"><Icon name="hospital" /></span><div><div className="brand-title"><strong>Hospital de Chancay</strong><span className="brand-tag">OTC / SBS</span></div><small>Oficina de Estadística e Informática · Área de Cómputo y Soporte</small></div></div><div className="topbar-actions"><span className="system-chip"><span className="status-dot" /> ENLACE DE CONFORMIDAD</span><span className="version-chip"><b>OTC</b><span>|</span>Visado de servicio</span><button className="theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Cambiar tema"><Icon name="moon" /><span>Tema</span></button></div></div></header>
    <main className="shell page-main"><section className="intro"><div className="intro-kicker-row"><span className="reference-chip"><Icon name="cpu" /> ORDEN DE TRABAJO CÓMPUTO · HARDWARE <span className="reference-code">· REF: {show(data?.order_code)}</span></span><span className="channel-note"><span className="status-dot" /> CANAL DE VISADO</span></div><div className="intro-bottom"><div><h1>Confirma el trabajo realizado</h1><p>Revisa con detalle la intervención técnica y, si estás conforme con lo realizado, registra tu firma manuscrita desde este dispositivo.</p></div><nav className="steps" aria-label="Progreso del visado">{['Revisar', 'Firmar', 'Confirmar'].map((label, index) => <React.Fragment key={label}>{index > 0 && <i /> }<div className={`step ${data && (index === 0 || index === 1 && pending || index === 2 && (data.state === 'CONFORME' || canSubmit)) ? 'active' : ''}`}><span className="step-number">{index + 1}</span><b>{index + 1}. {label}</b></div></React.Fragment>)}</nav></div></section>
      {notice && <div className={`notice ${notice.kind}`} role="status" aria-live="polite">{notice.text}</div>}
      {data && <div className="layout">{pending && <nav className="mobile-flow-nav" aria-label="Accesos de la orden"><a href="#order-details">Revisar la orden</a><a href="#sign-panel">Ir a la firma <Icon name="arrow-right" /></a></nav>}
        <article id="order-details" className="order-card"><div className="card-head"><div><div className="card-overline"><span>SOLICITUD DE CONFORMIDAD TÉCNICA</span><span className="revision">REV {data.version}</span></div><h2>{show(data.order_code)}</h2><span className="subdued">Versión {data.version} · Válida hasta {dateText(data.expires_at)}</span></div><span className={`badge ${pending ? '' : 'closed'}`}>{pending ? 'Pendiente de firma de usuario' : data.state === 'CONFORME' ? 'Visado registrado' : 'No disponible'}</span></div>
          <div className="details-two"><div className="info"><span>SERVICIO SOLICITANTE</span><strong>{show(data.service)}</strong></div><div className="info"><span>PERSONA SOLICITANTE</span><strong>{show(data.requester)}</strong></div></div>
          <section className="equipment-panel"><div className="panel-heading"><div><span className="panel-icon"><Icon name="display" /></span><h3>Inventario &amp; Equipo atendido</h3></div><span className="equipment-summary">{[data.equipment?.marca, data.equipment?.modelo].filter(Boolean).join(' ')}</span></div><div className="equipment-grid">{fields.map(([label, key]) => <div key={key}><span>{label}</span><strong>{show(data.equipment?.[key])}</strong></div>)}</div></section>
          <div className="work-grid"><section className="text-panel occurrence"><span className="panel-label">FALLA REPORTADA</span><p>{show(data.occurrence)}</p></section><section className="text-panel diagnosis"><span className="panel-label">DIAGNÓSTICO TÉCNICO</span><p>{show(data.diagnosis)}</p></section></div>
          <section className="text-panel work-done"><div className="work-title"><span className="panel-label">TRABAJO REALIZADO</span><span className="work-state">Intervención registrada</span></div><p>{show(data.work)}</p></section>
          <div className="timeline"><div><span>INICIO DE ATENCIÓN</span><strong>{dateText(data.started_at)}</strong></div><div><span>FINALIZACIÓN</span><strong>{dateText(data.ended_at)}</strong></div></div>
          {Array.isArray(data.jobs) && data.jobs.length > 0 && <section className="jobs-panel"><h3>Acciones complementarias registradas</h3><ul>{data.jobs.flatMap((job, i) => [job.tipo, job.observacion].filter(Boolean).map((value, j) => <li key={`${i}-${j}`}>{value}</li>))}</ul></section>}
          <details className="technical"><summary><span><Icon name="chevron-right" /> Datos de auditoría y verificación de esta versión</span><span className="hash-tag">SHA-256</span></summary><div className="technical-body"><strong>Huella del contenido de esta versión</strong><code>{data.document_sha256}</code><small>El PDF definitivo se genera únicamente después de sincronizar y validar la conformidad en el sistema local.</small></div></details>
          {pending && <a className="mobile-continue" href="#sign-panel">Ya revisé la orden · Ir a firmar <Icon name="arrow-right" /></a>}
        </article>
        {pending && <aside id="sign-panel" className="sign-card"><div className="sign-head"><div className="sign-head-left"><span className="sign-icon"><Icon name="pencil" /></span><div><span className="sign-overline">PASO FINAL · FIRMA</span><h2>Tu conformidad</h2></div></div><span className="legal-tag">VISADO OTC</span></div>
          <div className="warning"><Icon name="exclamation-triangle" /><p>Firma únicamente si reconoces el trabajo descrito. Tu firma quedará asociada a esta versión de la orden; no podrás modificarla después de confirmar.</p></div>
          <div className="signer"><div><span>SOLICITANTE DE LA OTC</span><span className="holder-tag">TITULAR</span></div><strong>{show(data.requester)}</strong></div>
          <label className="consent alternate-signer"><input type="checkbox" checked={thirdParty} onChange={event => { setThirdParty(event.target.checked); setSignerName(''); }} /><span>La persona solicitante no se encuentra; <strong>otra persona revisará y dará conformidad.</strong></span></label>
          {thirdParty && <div className="third-party-fields"><label htmlFor="third-party-name">Nombre completo de quien firma</label><input id="third-party-name" value={signerName} onChange={event => setSignerName(event.target.value)} maxLength={200} autoComplete="name" placeholder="Nombres y apellidos" /><small>Este nombre y su firma aparecerán en la constancia junto al solicitante original.</small></div>}
          <div className="signature-title"><span>PAD DE FIRMA MANUSCRITA</span><span>PNG · SHA-256</span></div><div className={`canvas-wrap ${signed ? 'signed' : ''}`}><Signature onChange={setSigned} clearSignal={clearSignal} theme={theme} /><div className="canvas-placeholder"><Icon name="pencil" /> Firma aquí con el dedo o el cursor</div></div>
          <div className="sign-actions"><small>Traza tu firma dentro del recuadro.</small><button className="text-button" onClick={() => setClearSignal(clearSignal + 1)}><Icon name="trash" /> Borrar firma</button></div>
          <label className="consent final-consent"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Declaro que soy la persona indicada arriba, he revisado la información y <strong>doy conformidad al trabajo realizado</strong> en esta orden.</span></label>
          <button className="primary-button" disabled={!canSubmit} onClick={submit}>{busy ? 'Registrando conformidad…' : 'Confirmar y enviar visado'} <Icon name="arrow-right" /></button>
          <button className="observe-button" onClick={() => setObserve(true)}><Icon name="x-circle" /> Observar con reparos</button><p className="privacy">Enlace personal y temporal · Firma manuscrita registrada, no certificada</p>
        </aside>}
      </div>}
    </main><footer className="footer"><div className="shell"><span>Hospital de Chancay y Servicios Básicos de Salud</span><span>Oficina de Estadística e Informática · Área de Soporte Técnico</span></div></footer>
    {observe && <div className="modal-backdrop" role="presentation" onClick={() => setObserve(false)}><div className="observe-dialog" role="dialog" aria-modal="true" aria-label="Observaciones" onClick={event => event.stopPropagation()}><div className="dialog-head"><Icon name="exclamation-triangle" /><h2>¿Tienes reparos sobre el trabajo?</h2></div><p>No firmes esta orden. Comunica la observación al área de Informática para que revise o corrija la OTC antes de emitir un nuevo enlace. Esta pantalla todavía no registra reparos en el sistema.</p><button onClick={() => setObserve(false)}>Entendido</button></div></div>}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
