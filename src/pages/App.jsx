import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabaseClient.js";
import {
  Plus, Trash2, FileText, ChevronRight, CheckCircle,
  Save, Send, X, Upload, AlertCircle, ReceiptText,
  ArrowLeft, Copy, Eye, Search, Building2,
  Settings, Moon, Sun, AlertTriangle, Download, Wand2, Cloud, CloudOff
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3) | 8).toString(16);
});
const fmt = n => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);
const fmtDate = d => d ? new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const todayISO = () => new Date().toISOString().split("T")[0];
const calcTotals = lines => {
  const byIva = {}; let subtotal = 0;
  (lines || []).forEach(l => {
    const base = (parseFloat(l.cantidad) || 0) * (parseFloat(l.precioUnitario) || 0);
    subtotal += base;
    const iva = parseFloat(l.iva) || 0;
    byIva[iva] = (byIva[iva] || 0) + base * iva / 100;
  });
  const totalIva = Object.values(byIva).reduce((a, v) => a + v, 0);
  return { subtotal, byIva, totalIva, total: subtotal + totalIva };
};

// Contrast ratio helper (WCAG)
const hexToRgb = hex => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
};
const luminance = ([r, g, b]) => {
  const s = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const contrastRatio = (hex1, hex2) => {
  const l1 = luminance(hexToRgb(hex1));
  const l2 = luminance(hexToRgb(hex2));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. MOTOR DE ADN VISUAL — generateCompanyVisualDNA()
// ─────────────────────────────────────────────────────────────────────────────
const PALETTES = [
  { primary: "#1a1a2e", accent: "#e94560" },
  { primary: "#0d3b66", accent: "#f4d35e" },
  { primary: "#1b4332", accent: "#52b788" },
  { primary: "#370617", accent: "#f48c06" },
  { primary: "#03045e", accent: "#00b4d8" },
  { primary: "#3d0066", accent: "#c77dff" },
  { primary: "#212529", accent: "#20c997" },
  { primary: "#1c1c1c", accent: "#ff6b35" },
  { primary: "#2d3a3a", accent: "#ffd166" },
  { primary: "#2b2d42", accent: "#ef233c" },
];

const FONT_PAIRS = [
  { heading: "'Georgia', serif", body: "'Plus Jakarta Sans', sans-serif", type: "elegant" },
  { heading: "'Courier New', monospace", body: "'Plus Jakarta Sans', sans-serif", type: "técnico" },
  { heading: "'Plus Jakarta Sans', sans-serif", body: "'Plus Jakarta Sans', sans-serif", type: "moderno" },
  { heading: "'Times New Roman', serif", body: "'Courier New', monospace", type: "clásico" },
  { heading: "'Arial Black', sans-serif", body: "'Plus Jakarta Sans', sans-serif", type: "impacto" },
  { heading: "'Palatino', serif", body: "'Plus Jakarta Sans', sans-serif", type: "refinado" },
  { heading: "'Trebuchet MS', sans-serif", body: "'Trebuchet MS', sans-serif", type: "redondeado" },
  { heading: "'Garamond', serif", body: "'Plus Jakarta Sans', sans-serif", type: "literario" },
  { heading: "'Impact', sans-serif", body: "'Plus Jakarta Sans', sans-serif", type: "editorial" },
  { heading: "'Didot', serif", body: "'Courier New', monospace", type: "lujoso" },
];

const TABLE_STYLES = [
  { id: "zebra", desc: "Filas alternadas" },
  { id: "minimal", desc: "Líneas mínimas" },
  { id: "rounded", desc: "Bordes redondeados" },
  { id: "shadowed", desc: "Celdas con sombra" },
  { id: "bordered", desc: "Borde completo" },
  { id: "pill", desc: "Filas tipo píldora" },
  { id: "ghost", desc: "Sin bordes visibles" },
  { id: "accent-left", desc: "Acento izquierdo" },
  { id: "dark-header", desc: "Cabecera oscura fuerte" },
];

const LAYOUTS = [
  { id: "classic", desc: "Logo arriba · QR abajo" },
  { id: "right-logo", desc: "Logo derecha · QR izquierda" },
  { id: "centered-qr", desc: "QR centrado · Logo marca de agua" },
  { id: "split", desc: "Cabecera dividida" },
  { id: "minimal-top", desc: "Minimalista superior" },
  { id: "bold-header", desc: "Cabecera en banda de color" },
  { id: "sidebar-logo", desc: "Logo en banda lateral" },
  { id: "mono-qr", desc: "QR grande · Logo pequeño" },
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateCompanyVisualDNA() {
  let palette = pick(PALETTES);
  let attempts = 0;
  while (contrastRatio(palette.primary, "#ffffff") < 4.5 && attempts < 20) {
    palette = pick(PALETTES); attempts++;
  }
  return {
    layout: pick(LAYOUTS),
    fonts: pick(FONT_PAIRS),
    palette: { primary: palette.primary, accent: palette.accent, text_on_primary: "#ffffff" },
    tableStyle: pick(TABLE_STYLES),
    borderRadius: pick([0, 4, 6, 8, 12, 16, 20, 24]),
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AUTOSAVE HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useAutosaveInvoice(invoice, onPersist) {
  const [saveStatus, setSaveStatus] = useState("idle");
  const timerRef = useRef(null);
  const prevRef = useRef(null);

  useEffect(() => {
    if (!invoice) return;
    const serialized = JSON.stringify(invoice);
    if (serialized === prevRef.current) return;
    prevRef.current = serialized;

    setSaveStatus("saving");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await onPersist(invoice);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2500);
      } catch {
        setSaveStatus("error");
      }
    }, 500);

    return () => clearTimeout(timerRef.current);
  }, [invoice, onPersist]);

  return saveStatus;
}

function SaveIndicator({ status }) {
  if (status === "idle") return null;
  const configs = {
    saving: { icon: <Cloud size={12} />, text: "Guardando…", color: "var(--text-muted)" },
    saved: { icon: <CheckCircle size={12} />, text: "Sincronizado", color: "#15803D" },
    error: { icon: <CloudOff size={12} />, text: "Error al guardar", color: "#DC2626" },
  };
  const c = configs[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: c.color, fontWeight: 500, transition: "opacity 0.3s" }}>
      {c.icon} {c.text}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────────────────────
const KEY = "cf_v3";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const persist = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { } };

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "success") => {
    const id = uuid();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3400);
  }, []);
  return { toasts, add };
}
function Toasts({ toasts }) {
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} className="toast" style={{ background: t.type === "success" ? "var(--toast-ok)" : t.type === "error" ? "var(--toast-err)" : "var(--toast-info)" }}>
          {t.type === "success" ? <CheckCircle size={14} /> : t.type === "error" ? <AlertTriangle size={14} /> : <AlertCircle size={14} />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmModal({ title, description, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-icon-danger"><Trash2 size={20} /></div>
        <h3 className="modal-title">{title}</h3>
        <p className="modal-desc">{description}</p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn-danger" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QR REAL — genera un QR auténtico con la librería qrcode
// ─────────────────────────────────────────────────────────────────────────────
function QRReal({ url, size = 100, color = "#111827" }) {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, {
      width: size * 2,
      margin: 1,
      color: { dark: color, light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then(setDataUrl).catch(console.error);
  }, [url, size, color]);
  if (!dataUrl) return <div style={{ width: size, height: size, background: "#F3F4F6", borderRadius: 6 }} />;
  return <img src={dataUrl} width={size} height={size} alt="QR" style={{ display: "block", borderRadius: 4 }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. INVOICE ENGINE
// ─────────────────────────────────────────────────────────────────────────────
function InvoiceEngine({ invoice, empresa, forExport = false, qrDataUrl = null }) {
  const dna = empresa.config_diseno || generateCompanyVisualDNA();
  const { layout, fonts, palette, tableStyle, borderRadius } = dna;
  const t = calcTotals(invoice.lineas || []);
  const qrUrl = `https://facturaspanel.vercel.app/f/${invoice.id}`;
  const br = forExport ? Math.min(borderRadius, 8) : borderRadius;

  const getRowStyle = (i, br) => {
    switch (tableStyle?.id) {
      case "zebra": return { background: i % 2 ? "#F9FAFB" : "#fff" };
      case "shadowed": return { boxShadow: "0 1px 4px rgba(0,0,0,0.07)", background: "#fff" };
      case "rounded": return { background: i % 2 ? "#F9FAFB" : "#fff", borderRadius: Math.max(br, 6) };
      case "pill": return { background: i % 2 ? `${palette.primary}08` : "#fff", borderRadius: 999 };
      case "ghost": return { background: "transparent" };
      case "accent-left": return { background: "#fff", borderLeft: `3px solid ${palette.accent}` };
      case "dark-header": return { background: i % 2 ? "#F9FAFB" : "#fff" };
      default: return { background: "#fff" };
    }
  };
  const tableWrapStyle =
    tableStyle?.id === "rounded" ? { borderRadius: Math.max(br, 10), overflow: "hidden", border: "1px solid #E5E7EB" }
      : tableStyle?.id === "bordered" ? { border: `2px solid ${palette.primary}`, borderRadius: br }
        : tableStyle?.id === "pill" ? { borderRadius: br, overflow: "hidden", border: "1px solid #E5E7EB" }
          : tableStyle?.id === "ghost" ? { borderBottom: `1px solid #E5E7EB` }
            : tableStyle?.id === "accent-left" ? { borderLeft: `4px solid ${palette.accent}` }
              : tableStyle?.id === "dark-header" ? { border: "1px solid #E5E7EB", borderRadius: br, overflow: "hidden" }
                : { borderTop: "1px solid #E5E7EB" };

  const W = forExport ? 800 : "100%";

  const LogoBlock = ({ size = 44, invert = false }) => (
    <div>
      {empresa.logo
        ? <img src={empresa.logo} alt="" style={{ height: size, objectFit: "contain", filter: invert ? "brightness(0) invert(1)" : "none" }} />
        : <span style={{ fontSize: size * 0.4, fontWeight: 800, fontFamily: fonts.heading, color: invert ? "#fff" : palette.primary }}>{empresa.nombre}</span>
      }
    </div>
  );

  const QRBlock = ({ size = 80 }) => (
    <div style={{ textAlign: "center" }}>
      <div style={{ background: "#fff", padding: 6, borderRadius: 8, display: "inline-block", border: "1px solid #E5E7EB" }}>
        {qrDataUrl
          ? <img src={qrDataUrl} width={size} height={size} alt="QR" style={{ display: "block", borderRadius: 4 }} />
          : <QRReal url={qrUrl} size={size} color={palette.primary} />
        }
      </div>
      <p style={{ fontSize: 9, color: "#9CA3AF", marginTop: 4, fontFamily: fonts.body }}>Verificar factura</p>
    </div>
  );

  const LinesTable = () => (
    <div style={{ ...tableWrapStyle, marginBottom: 28 }}>
      <table style={{ width: "100%", borderCollapse: tableStyle?.id === "rounded" ? "separate" : "collapse", borderSpacing: tableStyle?.id === "rounded" ? "0 3px" : 0 }}>
        <thead>
          <tr style={{ background: tableStyle?.id === "dark-header" ? "#111827" : palette.primary }}>
            {["Concepto", "Cant.", "P. Unit.", "IVA", "Total"].map((h, i) => (
              <th key={h} style={{ padding: "9px 10px", textAlign: i === 0 ? "left" : "right", fontSize: 10, color: palette.text_on_primary, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, fontFamily: fonts.body }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(invoice.lineas || []).map((l, i) => {
            const base = (parseFloat(l.cantidad) || 0) * (parseFloat(l.precioUnitario) || 0);
            const total = base + base * (parseFloat(l.iva) || 0) / 100;
            return (
              <tr key={l.id} style={{ borderBottom: tableStyle?.id === "minimal" ? "none" : "1px solid #F3F4F6", ...getRowStyle(i, br) }}>
                <td style={{ padding: "11px 10px", fontSize: 12, color: "#111827", fontFamily: fonts.body }}>{l.concepto || "—"}</td>
                <td style={{ padding: "11px 10px", fontSize: 12, color: "#6B7280", textAlign: "right", fontFamily: fonts.body }}>{l.cantidad}</td>
                <td style={{ padding: "11px 10px", fontSize: 12, color: "#6B7280", textAlign: "right", fontFamily: fonts.body }}>{fmt(l.precioUnitario)}</td>
                <td style={{ padding: "11px 10px", fontSize: 12, color: "#6B7280", textAlign: "right", fontFamily: fonts.body }}>{l.iva}%</td>
                <td style={{ padding: "11px 10px", fontSize: 12, color: "#111827", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", fontFamily: fonts.body }}>{fmt(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const TotalsBlock = () => (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 240, border: "1px solid #E5E7EB", borderRadius: br, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", fontSize: 12, color: "#6B7280", borderBottom: "1px solid #E5E7EB", fontFamily: fonts.body }}>
          <span>Subtotal</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(t.subtotal)}</span>
        </div>
        {Object.entries(t.byIva).map(([r, a]) => (
          <div key={r} style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", fontSize: 12, color: "#6B7280", borderBottom: "1px solid #E5E7EB", fontFamily: fonts.body }}>
            <span>IVA {r}%</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(a)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", fontSize: 15, fontWeight: 800, background: palette.primary, color: palette.text_on_primary, fontFamily: fonts.heading }}>
          <span>TOTAL</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(t.total)}</span>
        </div>
      </div>
    </div>
  );

  const MetaBlock = () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginBottom: 32 }}>
      <div>
        <p style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#9CA3AF", marginBottom: 6, fontFamily: fonts.body }}>Facturar a</p>
        <p style={{ fontWeight: 700, color: "#111827", fontSize: 13, fontFamily: fonts.heading }}>{invoice.clienteNombre || "—"}</p>
        {invoice.clienteNif && <p style={{ fontSize: 11, color: "#6B7280", fontFamily: fonts.body }}>{invoice.clienteNif}</p>}
        <p style={{ fontSize: 11, color: "#6B7280", whiteSpace: "pre-line", fontFamily: fonts.body }}>{invoice.clienteDireccion}</p>
      </div>
      <div>
        <p style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#9CA3AF", marginBottom: 6, fontFamily: fonts.body }}>Fecha emisión</p>
        <p style={{ fontSize: 13, color: "#111827", fontWeight: 500, fontFamily: fonts.body }}>{fmtDate(invoice.fecha)}</p>
      </div>
      <div>
        <p style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#9CA3AF", marginBottom: 6, fontFamily: fonts.body }}>Estado</p>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: invoice.estado === "Emitida" ? "#DCFCE7" : "#FEF9C3", color: invoice.estado === "Emitida" ? "#15803D" : "#854D0E", fontFamily: fonts.body }}>
          {invoice.estado}
        </span>
      </div>
    </div>
  );

  const FooterBlock = () => (
    <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid #E5E7EB` }}>
      {invoice.piePagina && <p style={{ fontSize: 10, color: "#9CA3AF", lineHeight: 1.7, whiteSpace: "pre-line", marginBottom: 8, fontFamily: fonts.body }}>{invoice.piePagina}</p>}
    </div>
  );

  const containerStyle = {
    background: "#fff",
    color: "#111827",
    width: W,
    minHeight: forExport ? 1050 : "auto",
    fontFamily: fonts.body,
  };

  if (layout?.id === "bold-header") {
    return (
      <div style={containerStyle}>
        <div style={{ background: palette.primary, padding: "36px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 0 }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 4, fontFamily: fonts.body }}>Factura</p>
            <p style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: -0.5, fontFamily: fonts.heading }}>{invoice.numeroFactura}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <LogoBlock size={48} invert />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4, fontFamily: fonts.body }}>{empresa.nif}</p>
          </div>
        </div>
        <div style={{ padding: "36px 48px" }}>
          <MetaBlock />
          {invoice.encabezadoLibre && <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 24, fontStyle: "italic", lineHeight: 1.7, fontFamily: fonts.body }}>{invoice.encabezadoLibre}</p>}
          <LinesTable />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <QRBlock size={90} />
            <TotalsBlock />
          </div>
          <FooterBlock />
        </div>
      </div>
    );
  }

  if (layout?.id === "right-logo") {
    return (
      <div style={containerStyle}>
        <div style={{ padding: "44px 48px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40, paddingBottom: 28, borderBottom: `2px solid ${palette.primary}` }}>
            <div style={{ display: "flex", gap: 48 }}>
              <QRBlock size={80} />
              <div>
                <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9CA3AF", marginBottom: 6, fontFamily: fonts.body }}>Factura</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: palette.primary, letterSpacing: -0.5, fontFamily: fonts.heading }}>{invoice.numeroFactura}</p>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <LogoBlock size={52} />
              <p style={{ fontSize: 11, color: "#6B7280", marginTop: 4, fontFamily: fonts.body }}>{empresa.nif}</p>
              <p style={{ fontSize: 11, color: "#6B7280", whiteSpace: "pre-line", fontFamily: fonts.body }}>{empresa.direccion}</p>
            </div>
          </div>
          <MetaBlock />
          {invoice.encabezadoLibre && <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 24, fontStyle: "italic", lineHeight: 1.7, fontFamily: fonts.body }}>{invoice.encabezadoLibre}</p>}
          <LinesTable />
          <TotalsBlock />
          <FooterBlock />
        </div>
      </div>
    );
  }

  if (layout?.id === "centered-qr") {
    return (
      <div style={containerStyle}>
        <div style={{ padding: "44px 48px" }}>
          <div style={{ textAlign: "center", marginBottom: 40, paddingBottom: 28, borderBottom: `2px solid ${palette.accent}` }}>
            <div style={{ opacity: 0.08, position: "absolute", left: "50%", top: 60, transform: "translateX(-50%)" }}>
              <LogoBlock size={120} />
            </div>
            <QRBlock size={100} />
            <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9CA3AF", marginTop: 12, fontFamily: fonts.body }}>Factura</p>
            <p style={{ fontSize: 32, fontWeight: 800, color: palette.primary, fontFamily: fonts.heading }}>{invoice.numeroFactura}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 36 }}>
            <div>
              <LogoBlock size={40} />
              <p style={{ fontSize: 11, color: "#6B7280", marginTop: 4, fontFamily: fonts.body }}>{empresa.nif}</p>
              <p style={{ fontSize: 11, color: "#6B7280", fontFamily: fonts.body }}>{empresa.direccion}</p>
            </div>
            <MetaBlock />
          </div>
          {invoice.encabezadoLibre && <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 24, fontStyle: "italic", lineHeight: 1.7, fontFamily: fonts.body }}>{invoice.encabezadoLibre}</p>}
          <LinesTable />
          <TotalsBlock />
          <FooterBlock />
        </div>
      </div>
    );
  }

  if (layout?.id === "sidebar-logo") {
    return (
      <div style={{ ...containerStyle, display: "flex" }}>
        <div style={{ width: 120, background: palette.primary, display: "flex", flexDirection: "column", alignItems: "center", padding: "36px 16px", gap: 24, flexShrink: 0 }}>
          <LogoBlock size={60} invert />
          <div style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.15)" }} />
          <QRBlock size={80} />
        </div>
        <div style={{ flex: 1, padding: "44px 40px" }}>
          <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `2px solid ${palette.accent}` }}>
            <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9CA3AF", fontFamily: fonts.body }}>Factura</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: palette.primary, fontFamily: fonts.heading }}>{invoice.numeroFactura}</p>
            <p style={{ fontSize: 11, color: "#6B7280", marginTop: 4, fontFamily: fonts.body }}>{empresa.nif} · {empresa.direccion?.split("\n")[0]}</p>
          </div>
          <MetaBlock />
          {invoice.encabezadoLibre && <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 24, fontStyle: "italic", lineHeight: 1.7, fontFamily: fonts.body }}>{invoice.encabezadoLibre}</p>}
          <LinesTable />
          <TotalsBlock />
          <FooterBlock />
        </div>
      </div>
    );
  }

  if (layout?.id === "split") {
    return (
      <div style={containerStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
          <div style={{ background: palette.primary, padding: "36px 36px 36px 48px" }}>
            <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 6, fontFamily: fonts.body }}>Factura</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: fonts.heading }}>{invoice.numeroFactura}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 8, fontFamily: fonts.body }}>
              {empresa.nombre} · {empresa.nif}
            </p>
          </div>
          <div style={{ background: palette.accent, padding: "36px 48px 36px 36px", display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center" }}>
            <LogoBlock size={52} invert />
            <QRBlock size={72} />
          </div>
        </div>
        <div style={{ padding: "36px 48px" }}>
          <MetaBlock />
          {invoice.encabezadoLibre && <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 24, fontStyle: "italic", lineHeight: 1.7, fontFamily: fonts.body }}>{invoice.encabezadoLibre}</p>}
          <LinesTable />
          <TotalsBlock />
          <FooterBlock />
        </div>
      </div>
    );
  }

  if (layout?.id === "mono-qr") {
    return (
      <div style={containerStyle}>
        <div style={{ padding: "44px 48px" }}>
          <div style={{ display: "flex", gap: 40, marginBottom: 36, paddingBottom: 28, borderBottom: `2px solid ${palette.primary}` }}>
            <div style={{ background: palette.primary, padding: 12, borderRadius: br, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <QRBlock size={110} />
            </div>
            <div style={{ flex: 1 }}>
              <LogoBlock size={48} />
              <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9CA3AF", marginTop: 16, marginBottom: 6, fontFamily: fonts.body }}>Factura</p>
              <p style={{ fontSize: 30, fontWeight: 800, color: palette.primary, fontFamily: fonts.heading }}>{invoice.numeroFactura}</p>
              <p style={{ fontSize: 11, color: "#6B7280", marginTop: 4, fontFamily: fonts.body }}>{empresa.nif}</p>
            </div>
          </div>
          <MetaBlock />
          {invoice.encabezadoLibre && <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 24, fontStyle: "italic", lineHeight: 1.7, fontFamily: fonts.body }}>{invoice.encabezadoLibre}</p>}
          <LinesTable />
          <TotalsBlock />
          <FooterBlock />
        </div>
      </div>
    );
  }

  if (layout?.id === "minimal-top") {
    return (
      <div style={containerStyle}>
        <div style={{ borderTop: `4px solid ${palette.accent}`, padding: "40px 48px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 48 }}>
            <div>
              <LogoBlock size={44} />
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6, fontFamily: fonts.body }}>{empresa.nif}</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", fontFamily: fonts.body }}>{empresa.direccion?.split("\n")[0]}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9CA3AF", marginBottom: 6, fontFamily: fonts.body }}>Factura</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: palette.primary, fontFamily: fonts.heading }}>{invoice.numeroFactura}</p>
            </div>
          </div>
          <div style={{ height: 1, background: "#E5E7EB", marginBottom: 32 }} />
          <MetaBlock />
          {invoice.encabezadoLibre && <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 24, fontStyle: "italic", lineHeight: 1.7, fontFamily: fonts.body }}>{invoice.encabezadoLibre}</p>}
          <LinesTable />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <QRBlock size={80} />
            <TotalsBlock />
          </div>
          <FooterBlock />
        </div>
      </div>
    );
  }

  // DEFAULT — "classic"
  return (
    <div style={containerStyle}>
      <div style={{ padding: "44px 48px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40, paddingBottom: 28, borderBottom: `2px solid ${palette.primary}` }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9CA3AF", marginBottom: 6, fontFamily: fonts.body }}>Factura</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: palette.primary, letterSpacing: -0.5, fontFamily: fonts.heading }}>{invoice.numeroFactura}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <LogoBlock size={52} />
            <p style={{ fontSize: 11, color: "#6B7280", marginTop: 4, fontFamily: fonts.body }}>{empresa.nif}</p>
            <p style={{ fontSize: 11, color: "#6B7280", whiteSpace: "pre-line", fontFamily: fonts.body }}>{empresa.direccion}</p>
          </div>
        </div>
        <MetaBlock />
        {invoice.encabezadoLibre && <p style={{ fontSize: 12, color: "#4B5563", marginBottom: 24, fontStyle: "italic", lineHeight: 1.7, fontFamily: fonts.body }}>{invoice.encabezadoLibre}</p>}
        <LinesTable />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 0 }}>
          <QRBlock size={90} />
          <TotalsBlock />
        </div>
        <FooterBlock />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────────────────────────────────────
const BLIND_QR_VALUE = "REF-ID-AUTH-SECURE-INV-8829-XAUTH-PANEL-PRIVADO-NO-SCAN-CF2025";

async function exportInvoicePDF(invoice, empresa, toast, setIsExporting) {
  const dna = empresa.config_diseno;
  const qrColor = dna?.palette?.primary || "#111827";

  setIsExporting(true);

  let blindQrDataUrl = "";
  try {
    blindQrDataUrl = await QRCode.toDataURL(BLIND_QR_VALUE, {
      width: 320, margin: 1,
      color: { dark: qrColor, light: "#ffffff" },
      errorCorrectionLevel: "H",
    });
  } catch (e) { console.warn("QR blind gen error:", e); }

  await new Promise(r => setTimeout(r, 200));

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;background:#fff;z-index:-1;";
  document.body.appendChild(container);

  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container);
  root.render(
    <InvoiceEngine invoice={invoice} empresa={empresa} forExport={true} qrDataUrl={blindQrDataUrl} />
  );

  await new Promise(r => setTimeout(r, 600));

  await Promise.all(
    Array.from(container.querySelectorAll("img")).map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 2000);
      });
    })
  );

  try {
    const canvas = await html2canvas(container, {
      scale: 2, useCORS: true, backgroundColor: "#ffffff", width: 800, windowWidth: 800,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = (canvas.height * pdfW) / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
    pdf.save(`${invoice.numeroFactura || "factura"}.pdf`);
    toast("PDF generado correctamente ✅");
  } catch (e) {
    console.error(e);
    toast("Error al generar PDF. Prueba la vista previa.", "error");
  } finally {
    root.unmount();
    document.body.removeChild(container);
    setIsExporting(false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE PREVIEW MODAL
// ─────────────────────────────────────────────────────────────────────────────
function InvoicePreviewModal({ invoice, empresa, onClose, onPDF, pdfLoading }) {
  const qrUrl = `https://facturaspanel.vercel.app/f/${invoice.id}`;
  return (
    <div className="modal-backdrop" style={{ alignItems: "flex-start", paddingTop: 32, paddingBottom: 32, overflow: "auto" }}>
      <div style={{ width: 860, maxWidth: "95vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button className="btn-ghost" onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, color: "#fff" }}>
            <X size={15} /> Cerrar
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-secondary" onClick={() => navigator.clipboard?.writeText(qrUrl)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Copy size={13} /> Copiar enlace QR
            </button>
            <button className="btn-primary" onClick={onPDF} disabled={pdfLoading} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Download size={13} /> {pdfLoading ? "Generando…" : "Descargar PDF"}
            </button>
          </div>
        </div>
        {empresa.config_diseno && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              empresa.config_diseno.layout?.desc,
              empresa.config_diseno.fonts?.type,
              empresa.config_diseno.tableStyle?.desc,
            ].filter(Boolean).map(tag => (
              <span key={tag} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: "rgba(255,255,255,0.15)", color: "#fff", fontWeight: 500 }}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.2)", borderRadius: 4, overflow: "hidden" }} id="a4-print">
          <InvoiceEngine invoice={invoice} empresa={empresa} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY CARD
// ─────────────────────────────────────────────────────────────────────────────
function EmpresaCard({ empresa, invoiceCount, emitedCount, onEnter, onDelete, delay }) {
  const dna = empresa.config_diseno;
  const accentColor = dna?.palette?.accent || "var(--accent)";
  const primaryColor = dna?.palette?.primary || "var(--text-primary)";

  return (
    <div className="empresa-card" style={{ animationDelay: `${delay}ms` }}>
      {dna && <div style={{ height: 4, background: `linear-gradient(90deg, ${primaryColor}, ${accentColor})`, borderRadius: "14px 14px 0 0", margin: "-20px -20px 16px" }} />}
      <div className="empresa-card-header">
        <div className="empresa-avatar" style={{ background: dna ? `${primaryColor}18` : "var(--accent-light)", color: dna ? primaryColor : "var(--accent)" }}>
          {empresa.logo ? <img src={empresa.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} /> : empresa.nombre.charAt(0).toUpperCase()}
        </div>
        <button className="icon-btn icon-btn-danger" onClick={() => onDelete(empresa.id)} title="Eliminar empresa"><Trash2 size={14} /></button>
      </div>
      <h3 className="empresa-name">{empresa.nombre}</h3>
      <p className="empresa-nif">{empresa.nif || "Sin NIF"}</p>
      <p className="empresa-address">{empresa.direccion?.split("\n")[0] || "Sin dirección"}</p>
      {dna && (
        <div style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}>
          <Wand2 size={10} style={{ color: "var(--text-muted)" }} />
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>ADN: {dna.layout?.desc} · {dna.fonts?.type}</span>
        </div>
      )}
      <div className="empresa-stats">
        <div className="stat-pill"><FileText size={11} /><span>{invoiceCount} factura{invoiceCount !== 1 ? "s" : ""}</span></div>
        {emitedCount > 0 && <div className="stat-pill stat-pill-green"><CheckCircle size={11} /><span>{emitedCount} emitida{emitedCount !== 1 ? "s" : ""}</span></div>}
      </div>
      <button className="btn-enter" style={{ background: dna ? primaryColor : "var(--accent)" }} onClick={() => onEnter(empresa.id)}>
        Gestionar empresa <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY FORM MODAL
// ─────────────────────────────────────────────────────────────────────────────
function EmpresaFormModal({ empresa, onChange, onSave, onCancel }) {
  const ref = useRef();
  const handleFile = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => onChange({ ...empresa, logo: ev.target.result });
    r.readAsDataURL(f);
  };
  return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ width: 440 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 className="modal-title" style={{ margin: 0 }}>{empresa.id ? "Editar empresa" : "Nueva empresa"}</h3>
          <button className="icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="label">Nombre *</label>
            <input className="input" value={empresa.nombre || ""} onChange={e => onChange({ ...empresa, nombre: e.target.value })} placeholder="Introduce el nombre de la empresa" />
          </div>
          <div className="field">
            <label className="label">NIF / CIF</label>
            <input className="input" value={empresa.nif || ""} onChange={e => onChange({ ...empresa, nif: e.target.value })} placeholder="B12345678" />
          </div>
          <div className="field" style={{ gridColumn: "1/-1" }}>
            <label className="label">Dirección</label>
            <textarea className="input" rows={2} style={{ resize: "none" }} value={empresa.direccion || ""} onChange={e => onChange({ ...empresa, direccion: e.target.value })} placeholder="Introduce la dirección aquí" />
          </div>
          <div className="field" style={{ gridColumn: "1/-1" }}>
            <label className="label">Logo</label>
            <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
            <button className="btn-secondary" onClick={() => ref.current?.click()} style={{ width: "100%", justifyContent: "center" }}>
              <Upload size={13} /> {empresa.logo ? "Cambiar logo" : "Subir logo"}
            </button>
            {empresa.logo && <img src={empresa.logo} alt="" style={{ marginTop: 8, height: 36, objectFit: "contain", borderRadius: 4 }} />}
          </div>
          {!empresa.id && (
            <div className="field" style={{ gridColumn: "1/-1" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--accent-light)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <Wand2 size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  Se generará un <strong>ADN Visual único</strong> automáticamente: paleta, tipografía y layout exclusivos para esta empresa.
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions" style={{ marginTop: 24 }}>
          <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn-primary" onClick={onSave} disabled={!empresa.nombre?.trim()}>
            {empresa.id ? "Guardar cambios" : "Crear empresa"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE EDITOR (with autosave)
// ─────────────────────────────────────────────────────────────────────────────
const emptyLine = () => ({ id: uuid(), concepto: "", cantidad: 1, precioUnitario: 0, iva: 21 });

function InvoiceEditor({ invoice, empresa, onChange, onPersist, onEmit, onPreview, onBack, locked }) {
  const t = calcTotals(invoice.lineas);
  const setF = (k, v) => onChange({ ...invoice, [k]: v });
  const setL = (id, k, v) => onChange({ ...invoice, lineas: invoice.lineas.map(l => l.id === id ? { ...l, [k]: v } : l) });
  const addL = () => onChange({ ...invoice, lineas: [...invoice.lineas, emptyLine()] });
  const delL = id => onChange({ ...invoice, lineas: invoice.lineas.filter(l => l.id !== id) });

  const liveInvoice = locked ? null : invoice;
  const saveStatus = useAutosaveInvoice(liveInvoice, onPersist);

  const dna = empresa.config_diseno;
  const accentColor = dna?.palette?.accent || "var(--accent)";

  return (
    <div className="editor-wrap">
      <div className="editor-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn-ghost" style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }} onClick={onBack}>
            <ArrowLeft size={14} /> Facturas
          </button>
          <span style={{ color: "var(--border)" }}>·</span>
          <span className="editor-title">{invoice.numeroFactura || "Nueva"}</span>
          <span className={`status-badge ${invoice.estado === "Emitida" ? "status-emitida" : "status-borrador"}`}>{invoice.estado}</span>
          {!locked && <SaveIndicator status={saveStatus} />}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!locked && (
            <button className="btn-primary" onClick={onEmit} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Send size={13} /> Finalizar factura
            </button>
          )}
          <button className="btn-secondary" onClick={onPreview} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Eye size={13} /> Vista previa & PDF
          </button>
        </div>
      </div>

      {locked && (
        <div className="locked-banner">
          <CheckCircle size={15} />
          <span>Factura emitida · edición bloqueada · URL pública: <strong>facturaspanel.vercel.app/f/{invoice.id}</strong></span>
        </div>
      )}

      {dna && (
        <div style={{ height: 3, background: `linear-gradient(90deg, ${dna.palette.primary}, ${accentColor}, ${dna.palette.primary})` }} />
      )}

      <div className="editor-body">
        <div className="editor-section">
          <p className="section-label">Datos de la factura</p>
          <div className="form-grid">
            <div className="field">
              <label className="label">Nº Factura <span style={{ color: "var(--accent)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· editable</span></label>
              <input className="input" value={invoice.numeroFactura || ""} onChange={e => setF("numeroFactura", e.target.value)} placeholder="Ej: FAC-2025-4821" />
              <span style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Generado aleatoriamente · puedes cambiarlo libremente</span>
            </div>
            <div className="field"><label className="label">Fecha</label><input type="date" className="input" value={invoice.fecha || ""} onChange={e => setF("fecha", e.target.value)} disabled={locked} /></div>
            <div className="field" style={{ gridColumn: "1/-1" }}><label className="label">Encabezado libre</label><textarea className="input" rows={2} style={{ resize: "none" }} value={invoice.encabezadoLibre || ""} onChange={e => setF("encabezadoLibre", e.target.value)} disabled={locked} placeholder="Texto opcional que aparece en la factura..." /></div>
          </div>
        </div>

        <div className="editor-section">
          <p className="section-label">Datos del cliente</p>
          <div className="form-grid">
            <div className="field"><label className="label">Nombre / Razón social</label><input className="input" value={invoice.clienteNombre || ""} onChange={e => setF("clienteNombre", e.target.value)} disabled={locked} placeholder="Cliente S.A." /></div>
            <div className="field"><label className="label">NIF / CIF</label><input className="input" value={invoice.clienteNif || ""} onChange={e => setF("clienteNif", e.target.value)} disabled={locked} placeholder="A87654321" /></div>
            <div className="field" style={{ gridColumn: "1/-1" }}><label className="label">Dirección</label><textarea className="input" rows={2} style={{ resize: "none" }} value={invoice.clienteDireccion || ""} onChange={e => setF("clienteDireccion", e.target.value)} disabled={locked} /></div>
          </div>
        </div>

        <div className="editor-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <p className="section-label" style={{ margin: 0 }}>Conceptos</p>
            {!locked && <button className="btn-secondary" onClick={addL} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 12px" }}><Plus size={12} /> Añadir línea</button>}
          </div>
          <div className="table-wrap">
            <table className="lines-table">
              <thead>
                <tr>{["Concepto", "Cant.", "P. Unit.", "IVA %", "Total", !locked && ""].filter(Boolean).map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {invoice.lineas.map(l => {
                  const base = (parseFloat(l.cantidad) || 0) * (parseFloat(l.precioUnitario) || 0);
                  const total = base + base * (parseFloat(l.iva) || 0) / 100;
                  return (
                    <tr key={l.id} className="line-row">
                      <td style={{ width: "40%" }}><input className="input cell-input" value={l.concepto} onChange={e => setL(l.id, "concepto", e.target.value)} disabled={locked} placeholder="Servicio o producto" /></td>
                      <td style={{ width: "9%" }}><input type="number" className="input cell-input" style={{ textAlign: "right" }} value={l.cantidad} onChange={e => setL(l.id, "cantidad", e.target.value)} disabled={locked} /></td>
                      <td style={{ width: "15%" }}><input type="number" className="input cell-input" style={{ textAlign: "right" }} value={l.precioUnitario} onChange={e => setL(l.id, "precioUnitario", e.target.value)} disabled={locked} step="0.01" /></td>
                      <td style={{ width: "10%" }}>
                        <select className="input cell-input" value={l.iva} onChange={e => setL(l.id, "iva", parseFloat(e.target.value))} disabled={locked}>
                          {[0, 4, 10, 21, 23].map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, color: "var(--text-primary)", fontWeight: 600, paddingRight: 12 }}>{fmt(total)}</td>
                      {!locked && <td style={{ textAlign: "center" }}><button className="icon-btn icon-btn-danger" onClick={() => delL(l.id)}><Trash2 size={13} /></button></td>}
                    </tr>
                  );
                })}
                {invoice.lineas.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: "28px 0", color: "var(--text-muted)", fontSize: 13 }}>Sin líneas — añade conceptos arriba</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <div className="totals-block">
              <div className="total-row"><span>Subtotal</span><span>{fmt(t.subtotal)}</span></div>
              {Object.entries(t.byIva).map(([r, a]) => <div key={r} className="total-row"><span>IVA {r}%</span><span>{fmt(a)}</span></div>)}
              <div className="total-row total-final"><span>TOTAL</span><span>{fmt(t.total)}</span></div>
            </div>
          </div>
        </div>

        {locked && (
          <div className="editor-section">
            <p className="section-label">Código QR de verificación</p>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div className="qr-box" style={{ color: dna?.palette?.primary || "var(--text-primary)" }}>
                <QRReal url={`https://facturaspanel.vercel.app/f/${invoice.id}`} size={100} color={dna?.palette?.primary || "#111827"} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Enlace público de la factura</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>El cliente puede escanear este QR para verificar la autenticidad.</p>
                <div className="qr-url-row">
                  <code className="qr-url">facturaspanel.vercel.app/f/{invoice.id}</code>
                  <button className="icon-btn" onClick={() => navigator.clipboard?.writeText(`https://facturaspanel.vercel.app/f/${invoice.id}`)}><Copy size={13} /></button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="editor-section">
          <p className="section-label">Pie de página</p>
          <textarea className="input" rows={3} style={{ resize: "none", width: "100%" }} value={invoice.piePagina || ""} onChange={e => setF("piePagina", e.target.value)} disabled={locked} placeholder="Condiciones de pago, IBAN, notas de agradecimiento..." />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE LIST
// ─────────────────────────────────────────────────────────────────────────────
function InvoiceList({ facturas, onSelect, onNew, onDelete }) {
  const [search, setSearch] = useState("");
  const filtered = facturas.filter(f => `${f.numeroFactura} ${f.clienteNombre}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="list-wrap">
      <div className="list-topbar">
        <div>
          <h2 className="page-title">Facturas</h2>
          <p className="page-subtitle">{facturas.length} factura{facturas.length !== 1 ? "s" : ""} en total</p>
        </div>
        <button className="btn-primary" onClick={onNew} style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Nueva factura</button>
      </div>
      <div className="search-row">
        <div className="search-box"><Search size={14} className="search-icon" /><input className="search-input" placeholder="Buscar por número o cliente..." value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">
          <ReceiptText size={32} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
          <p style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{search ? "Sin resultados" : "Sin facturas todavía"}</p>
          {!search && <button className="btn-secondary" onClick={onNew} style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}><Plus size={13} /> Crear primera factura</button>}
        </div>
      ) : (
        <div className="invoice-table-wrap">
          <table className="invoice-table">
            <thead><tr>{["Nº Factura", "Cliente", "Fecha", "Total", "Estado", ""].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map(f => {
                const t = calcTotals(f.lineas);
                return (
                  <tr key={f.id} className="inv-row" onClick={() => onSelect(f.id)}>
                    <td><span className="inv-num">{f.numeroFactura}</span></td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>{f.clienteNombre || <em style={{ color: "var(--text-muted)" }}>Sin cliente</em>}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: 13 }}>{fmtDate(f.fecha)}</td>
                    <td style={{ fontWeight: 600, fontSize: 13, fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>{fmt(t.total)}</td>
                    <td><span className={`status-badge ${f.estado === "Emitida" ? "status-emitida" : "status-borrador"}`}>{f.estado}</span></td>
                    <td><button className="icon-btn icon-btn-danger" onClick={e => { e.stopPropagation(); onDelete(f.id); }}><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PANEL — con edición manual completa del ADN Visual
// ─────────────────────────────────────────────────────────────────────────────
function SettingsPanel({ empresa, onChange, onSave, onRegenDNA }) {
  const [local, setLocal] = useState({ ...empresa });
  const ref = useRef();

  const handleFile = e => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setLocal(p => ({ ...p, logo: ev.target.result }));
    r.readAsDataURL(f);
  };

  const dna = local.config_diseno;

  // Helper para actualizar un campo del ADN
  const setDna = (field, value) => {
    setLocal(p => ({
      ...p,
      config_diseno: { ...p.config_diseno, [field]: value }
    }));
  };

  const setDnaPalette = (key, value) => {
    setLocal(p => ({
      ...p,
      config_diseno: {
        ...p.config_diseno,
        palette: { ...p.config_diseno.palette, [key]: value }
      }
    }));
  };

  return (
    <div className="list-wrap">
      <div className="list-topbar">
        <div>
          <h2 className="page-title">Configuración</h2>
          <p className="page-subtitle">Datos de la empresa emisora</p>
        </div>
        <button className="btn-primary" onClick={() => { onChange(local); onSave(); }}>Guardar cambios</button>
      </div>

      <div style={{ padding: "0 28px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Datos de la empresa ── */}
        <div className="editor-section" style={{ maxWidth: 560 }}>
          <p className="section-label">Datos de la empresa</p>
          <div className="form-grid">
            <div className="field">
              <label className="label">Nombre *</label>
              <input className="input" value={local.nombre || ""} onChange={e => setLocal(p => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">NIF / CIF</label>
              <input className="input" value={local.nif || ""} onChange={e => setLocal(p => ({ ...p, nif: e.target.value }))} />
            </div>
            <div className="field" style={{ gridColumn: "1/-1" }}>
              <label className="label">Dirección</label>
              <textarea className="input" rows={3} style={{ resize: "none" }} value={local.direccion || ""} onChange={e => setLocal(p => ({ ...p, direccion: e.target.value }))} />
            </div>
            <div className="field" style={{ gridColumn: "1/-1" }}>
              <label className="label">Logo de la empresa</label>
              <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
              <button className="btn-secondary" onClick={() => ref.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Upload size={13} /> {local.logo ? "Cambiar logo" : "Subir logo"}
              </button>
              {local.logo && <img src={local.logo} alt="" style={{ marginTop: 10, height: 44, objectFit: "contain", borderRadius: 6 }} />}
            </div>
          </div>
        </div>

        {/* ── ADN Visual editable ── */}
        {dna && (
          <div className="editor-section" style={{ maxWidth: 560 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <p className="section-label" style={{ margin: 0 }}>ADN Visual</p>
              <button
                className="btn-secondary"
                onClick={() => {
                  const nd = generateCompanyVisualDNA();
                  setLocal(p => ({ ...p, config_diseno: nd }));
                  onRegenDNA(nd);
                }}
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}
              >
                <Wand2 size={12} /> Regenerar ADN
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Colores */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="field">
                  <label className="label">Color principal</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="color"
                      value={dna.palette.primary}
                      onChange={e => setDnaPalette("primary", e.target.value)}
                      style={{ width: 40, height: 36, padding: 2, borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface)" }}
                    />
                    <input
                      className="input"
                      value={dna.palette.primary}
                      onChange={e => setDnaPalette("primary", e.target.value)}
                      placeholder="#1a1a2e"
                      style={{ fontFamily: "monospace", fontSize: 12 }}
                    />
                  </div>
                </div>

                <div className="field">
                  <label className="label">Color de acento</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="color"
                      value={dna.palette.accent}
                      onChange={e => setDnaPalette("accent", e.target.value)}
                      style={{ width: 40, height: 36, padding: 2, borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface)" }}
                    />
                    <input
                      className="input"
                      value={dna.palette.accent}
                      onChange={e => setDnaPalette("accent", e.target.value)}
                      placeholder="#f48c06"
                      style={{ fontFamily: "monospace", fontSize: 12 }}
                    />
                  </div>
                </div>
              </div>

              {/* Preview de colores */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ width: 36, height: 36, background: dna.palette.primary, borderRadius: 8, flexShrink: 0, border: "2px solid var(--border)" }} />
                <div style={{ width: 36, height: 36, background: dna.palette.accent, borderRadius: 8, flexShrink: 0, border: "2px solid var(--border)" }} />
                <div style={{ flex: 1, height: 18, background: `linear-gradient(90deg, ${dna.palette.primary}, ${dna.palette.accent})`, borderRadius: 4 }} />
              </div>

              {/* Layout */}
              <div className="field">
                <label className="label">Layout</label>
                <select
                  className="input"
                  value={dna.layout?.id || "classic"}
                  onChange={e => {
                    const found = LAYOUTS.find(l => l.id === e.target.value);
                    setDna("layout", found);
                  }}
                >
                  {LAYOUTS.map(l => (
                    <option key={l.id} value={l.id}>{l.desc}</option>
                  ))}
                </select>
              </div>

              {/* Tipografía */}
              <div className="field">
                <label className="label">Tipografía</label>
                <select
                  className="input"
                  value={dna.fonts?.type || "moderno"}
                  onChange={e => {
                    const found = FONT_PAIRS.find(f => f.type === e.target.value);
                    setDna("fonts", found);
                  }}
                >
                  {FONT_PAIRS.map(f => (
                    <option key={f.type} value={f.type}>{f.type}</option>
                  ))}
                </select>
              </div>

              {/* Estilo de tabla */}
              <div className="field">
                <label className="label">Estilo de tabla</label>
                <select
                  className="input"
                  value={dna.tableStyle?.id || "zebra"}
                  onChange={e => {
                    const found = TABLE_STYLES.find(t => t.id === e.target.value);
                    setDna("tableStyle", found);
                  }}
                >
                  {TABLE_STYLES.map(t => (
                    <option key={t.id} value={t.id}>{t.desc}</option>
                  ))}
                </select>
              </div>

              {/* Radio de borde */}
              <div className="field">
                <label className="label">Radio de borde — {dna.borderRadius}px</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={2}
                    value={dna.borderRadius}
                    onChange={e => setDna("borderRadius", parseInt(e.target.value))}
                    style={{ flex: 1, accentColor: dna.palette.primary }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", minWidth: 36, textAlign: "right" }}>{dna.borderRadius}px</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  <span>Cuadrado</span><span>Redondeado</span>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, error, loading }) {
  const [email, setEmail] = useState("")
  const [pass, setPass] = useState("")

  const handleSubmit = async e => {
    e.preventDefault()
    await onLogin(email, pass)
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", fontFamily: "'Plus Jakarta Sans','Segoe UI',sans-serif" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 40, width: 360, boxShadow: "0 8px 32px rgba(0,0,0,.08)" }}>
        <div style={{ width: 40, height: 40, background: "var(--accent)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <FileText size={20} color="#fff" />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4, letterSpacing: -0.3 }}>Centro de Facturación</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 28 }}>Acceso restringido</p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="field">
            <label className="label">Correo electrónico</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" required autoComplete="email" />
          </div>
          <div className="field">
            <label className="label">Contraseña</label>
            <input className="input" type="password" value={pass} onChange={e => setPass(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && (
            <div style={{ fontSize: 12, color: "var(--danger)", background: "var(--danger-light)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--danger)" }}>
              {error}
            </div>
          )}
          <button className="btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
            {loading ? "Entrando…" : "Entrar al panel"}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const { toasts, add: toast } = useToast()

  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogin = async (email, password) => {
    setLoginLoading(true)
    setAuthError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setAuthError(error.message); return }
      const { data: allowed } = await supabase
        .from("usuarios_autorizados")
        .select("activo")
        .eq("email", email)
        .single()
      if (!allowed?.activo) {
        await supabase.auth.signOut()
        setAuthError("Acceso no autorizado. Contacta con el administrador.")
      }
    } catch {
      setAuthError("Error al iniciar sesión.")
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  const [dark, setDark] = useState(() => { try { return JSON.parse(localStorage.getItem("cf_dark")) ?? false; } catch { return false; } });
  const [empresas, setEmpresas] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [activeEmpresaId, setActiveEmpresaId] = useState(null);
  const [sideNav, setSideNav] = useState("facturas");
  const [activeFacturaId, setActiveFacturaId] = useState(null);
  const [showNewEmpresa, setShowNewEmpresa] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState(null);
  const [previewFactura, setPreviewFactura] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [dirSearch, setDirSearch] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    async function cargarDatos() {
      setDbLoading(true);
      try {
        const userId = session.user.id;
        const [{ data: emps }, { data: facts }] = await Promise.all([
          supabase.from("empresas").select("*").eq("user_id", userId).order("created_at"),
          supabase.from("facturas").select("*").eq("user_id", userId).order("created_at"),
        ]);
        setEmpresas(emps || []);
        setFacturas((facts || []).map(f => ({
          id: f.id,
          empresaId: f.empresa_id,
          numeroFactura: f.numero,
          fecha: f.fecha,
          estado: f.estado,
          clienteNombre: f.cliente_nombre || "",
          clienteNif: f.cliente_nif || "",
          clienteDireccion: f.cliente_dir || "",
          encabezadoLibre: f.encabezado || "",
          piePagina: f.pie_pagina || "",
          lineas: Array.isArray(f.items) ? f.items : [],
        })));
      } catch (e) {
        console.error("Error cargando datos:", e);
      } finally {
        setDbLoading(false);
      }
    }
    cargarDatos();
  }, [session]);

  useEffect(() => {
    localStorage.setItem("cf_dark", JSON.stringify(dark));
  }, [dark]);

  const activeEmpresa = empresas.find(e => e.id === activeEmpresaId);
  const companyInvoices = facturas.filter(f => f.empresaId === activeEmpresaId);
  const activeFactura = facturas.find(f => f.id === activeFacturaId);
  const isLocked = activeFactura?.estado === "Emitida";

  const handleAutoPersist = useCallback(async (invoice) => {
    setFacturas(p => p.map(f => f.id === invoice.id ? invoice : f));
    try {
      const { subtotal, totalIva: iva, total } = calcTotals(invoice.lineas || []);
      await supabase.from("facturas").upsert({
        id: invoice.id,
        user_id: session.user.id,
        empresa_id: invoice.empresaId,
        numero: invoice.numeroFactura,
        fecha: invoice.fecha,
        estado: invoice.estado,
        cliente_nombre: invoice.clienteNombre,
        cliente_nif: invoice.clienteNif,
        cliente_dir: invoice.clienteDireccion,
        encabezado: invoice.encabezadoLibre,
        pie_pagina: invoice.piePagina,
        items: invoice.lineas,
        subtotal, iva, total,
        empresa_snapshot: null,
      });
    } catch (e) { console.error("Autosave error:", e); }
  }, [session]);

  const filteredEmpresas = empresas.filter(e => e.nombre.toLowerCase().includes(dirSearch.toLowerCase()));

  if (authLoading || (session && dbLoading)) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9FAFB", fontFamily: "sans-serif", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 32, height: 32, border: "3px solid #E5E7EB", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ fontSize: 13, color: "#9CA3AF" }}>{session ? "Cargando datos…" : ""}</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (!session) return (
    <div className={dark ? "dark" : ""}>
      <style>{`:root{--bg:#F9FAFB;--surface:#fff;--surface2:#F3F4F6;--border:#E5E7EB;--text-primary:#111827;--text-secondary:#374151;--text-muted:#9CA3AF;--accent:#2563EB;--danger:#DC2626;--danger-light:#FEF2F2;}
      .dark{--bg:#0F172A;--surface:#1E293B;--surface2:#0F172A;--border:#334155;--text-primary:#F1F5F9;--text-secondary:#CBD5E1;--text-muted:#64748B;--accent:#3B82F6;--danger:#EF4444;--danger-light:#2D0A0A;}
      .field{display:flex;flex-direction:column;gap:5px}.label{font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}.input{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:13px;color:var(--text-primary);font-family:inherit;outline:none;transition:border-color .15s,box-shadow .15s;width:100%}.input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(37,99,235,.1)}.btn-primary{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:all .15s;display:inline-flex;align-items:center;gap:6px}.btn-primary:disabled{opacity:.5;cursor:not-allowed}`}</style>
      <LoginScreen onLogin={handleLogin} error={authError} loading={loginLoading} />
    </div>
  )

  // ── Empresa CRUD ──
  const handleSaveEmpresa = async () => {
    if (!editingEmpresa?.nombre?.trim()) return;
    const userId = session.user.id;
    if (editingEmpresa.id) {
      const updated = { ...editingEmpresa };
      setEmpresas(p => p.map(e => e.id === updated.id ? updated : e));
      await supabase.from("empresas").update({
        nombre: updated.nombre, nif: updated.nif,
        direccion: updated.direccion, logo: updated.logo,
        config_diseno: updated.config_diseno,
      }).eq("id", updated.id);
      toast("Empresa actualizada");
    } else {
      const dna = generateCompanyVisualDNA();
      const newId = uuid();
      const ne = { ...editingEmpresa, id: newId, config_diseno: dna, user_id: userId };
      setEmpresas(p => [...p, ne]);
      await supabase.from("empresas").insert({
        id: newId, user_id: userId,
        nombre: ne.nombre, nif: ne.nif,
        direccion: ne.direccion, logo: ne.logo,
        config_diseno: dna,
      });
      toast(`✨ Empresa creada con ADN Visual único: ${dna.layout?.desc}`);
    }
    setShowNewEmpresa(false); setEditingEmpresa(null);
  };

  const handleDeleteEmpresa = async id => {
    setEmpresas(p => p.filter(e => e.id !== id));
    setFacturas(p => p.filter(f => f.empresaId !== id));
    if (activeEmpresaId === id) { setActiveEmpresaId(null); setActiveFacturaId(null); }
    setConfirmDelete(null);
    await supabase.from("facturas").delete().eq("empresa_id", id);
    await supabase.from("empresas").delete().eq("id", id);
    toast("Empresa y datos eliminados", "info");
  };

  // ── Factura CRUD ──
  const handleNewFactura = async () => {
    const usados = new Set(companyInvoices.map(f => f.numeroFactura));
    let n;
    do { n = Math.floor(Math.random() * 7000) + 3000; }
    while (usados.has(`FAC-${new Date().getFullYear()}-${n}`));
    const newId = uuid();
    const f = {
      id: newId, empresaId: activeEmpresaId,
      numeroFactura: `FAC-${new Date().getFullYear()}-${n}`,
      fecha: todayISO(), encabezadoLibre: "", piePagina: "",
      estado: "Borrador", clienteNombre: "", clienteNif: "", clienteDireccion: "",
      lineas: [emptyLine()],
    };
    setFacturas(p => [...p, f]);
    setActiveFacturaId(f.id);
    await supabase.from("facturas").insert({
      id: newId, user_id: session.user.id, empresa_id: activeEmpresaId,
      numero: f.numeroFactura, fecha: f.fecha, estado: f.estado,
      cliente_nombre: "", cliente_nif: "", cliente_dir: "",
      encabezado: "", pie_pagina: "", items: f.lineas,
      subtotal: 0, iva: 0, total: 0, empresa_snapshot: null,
    });
  };

  const handleFacturaChange = updated => setFacturas(p => p.map(f => f.id === updated.id ? updated : f));

  const handleEmitFactura = async () => {
    const factura = facturas.find(f => f.id === activeFacturaId);
    const empresa = empresas.find(e => e.id === activeEmpresaId);
    const updated = { ...factura, estado: "Emitida" };
    setFacturas(p => p.map(f => f.id === activeFacturaId ? updated : f));
    const { subtotal, totalIva: iva, total } = calcTotals(updated.lineas || []);
    const snapshot = {
      nombre: empresa.nombre, nif: empresa.nif,
      direccion: empresa.direccion, logo_url: empresa.logo,
      config_diseno: empresa.config_diseno,
    };
    await supabase.from("facturas").upsert({
      id: updated.id, user_id: session.user.id, empresa_id: updated.empresaId,
      numero: updated.numeroFactura, fecha: updated.fecha, estado: "Emitida",
      cliente_nombre: updated.clienteNombre, cliente_nif: updated.clienteNif,
      cliente_dir: updated.clienteDireccion, encabezado: updated.encabezadoLibre,
      pie_pagina: updated.piePagina, items: updated.lineas,
      subtotal, iva, total, empresa_snapshot: snapshot,
    });
    toast("✅ Factura emitida y bloqueada");
    setPreviewFactura(activeFacturaId);
  };

  const handleDeleteFactura = async id => {
    setFacturas(p => p.filter(f => f.id !== id));
    if (activeFacturaId === id) setActiveFacturaId(null);
    setConfirmDelete(null);
    await supabase.from("facturas").delete().eq("id", id);
    toast("Factura eliminada", "info");
  };

  const handlePDF = async () => {
    const f = facturas.find(x => x.id === previewFactura);
    const e = empresas.find(x => x.id === f?.empresaId);
    if (!f || !e) return;
    setPdfLoading(true);
    await exportInvoicePDF(f, e, toast, setIsExporting);
    setPdfLoading(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #F9FAFB; --surface: #FFFFFF; --surface2: #F3F4F6;
          --border: #E5E7EB; --border-strong: #D1D5DB;
          --text-primary: #111827; --text-secondary: #374151; --text-muted: #9CA3AF;
          --accent: #2563EB; --accent-hover: #1D4ED8; --accent-light: #EFF6FF;
          --danger: #DC2626; --danger-hover: #B91C1C; --danger-light: #FEF2F2;
          --sidebar: #FFFFFF; --sidebar-border: #E5E7EB; --sidebar-hover: #F9FAFB;
          --sidebar-active: #EFF6FF; --sidebar-active-text: #2563EB;
          --success-bg: #DCFCE7; --success-text: #15803D;
          --draft-bg: #FEF9C3; --draft-text: #854D0E;
          --toast-ok: #15803D; --toast-err: #DC2626; --toast-info: #374151;
        }
        .dark {
          --bg: #0F172A; --surface: #1E293B; --surface2: #0F172A;
          --border: #334155; --border-strong: #475569;
          --text-primary: #F1F5F9; --text-secondary: #CBD5E1; --text-muted: #64748B;
          --accent: #3B82F6; --accent-hover: #2563EB; --accent-light: #1E3A5F;
          --danger: #EF4444; --danger-hover: #DC2626; --danger-light: #2D0A0A;
          --sidebar: #1E293B; --sidebar-border: #334155; --sidebar-hover: #0F172A;
          --sidebar-active: #1E3A5F; --sidebar-active-text: #60A5FA;
          --success-bg: #052E16; --success-text: #34D399;
          --draft-bg: #1C1209; --draft-text: #FCD34D;
          --toast-ok: #065F46; --toast-err: #7F1D1D; --toast-info: #1E293B;
        }

        body { font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; background: var(--bg); color: var(--text-primary); transition: background .2s, color .2s; }
        .app { display: flex; height: 100vh; overflow: hidden; }
        .sidebar { width: 220px; background: var(--sidebar); border-right: 1px solid var(--sidebar-border); display: flex; flex-direction: column; flex-shrink: 0; transition: background .2s; }
        .main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .topbar { height: 56px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 24px; flex-shrink: 0; }
        .topbar-brand { font-size: 15px; font-weight: 700; color: var(--text-primary); letter-spacing: -.3px; }
        .sidebar-header { padding: 16px 14px 12px; border-bottom: 1px solid var(--sidebar-border); }
        .back-btn { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); background: none; border: none; cursor: pointer; padding: 4px 2px; width: 100%; transition: color .15s; font-family: inherit; }
        .back-btn:hover { color: var(--accent); }
        .sidebar-co-name { font-size: 13px; font-weight: 700; color: var(--text-primary); margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sidebar-co-nif { font-size: 11px; color: var(--text-muted); }
        .sidebar-nav { padding: 10px 8px; flex: 1; }
        .nav-item { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text-secondary); border: none; background: none; width: 100%; transition: all .12s; font-family: inherit; }
        .nav-item:hover { background: var(--sidebar-hover); color: var(--text-primary); }
        .nav-item.active { background: var(--sidebar-active); color: var(--sidebar-active-text); font-weight: 600; }
        .btn-primary { background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 600; font-family: inherit; transition: all .15s; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37,99,235,.3); }
        .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .btn-secondary { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 7px 14px; cursor: pointer; font-size: 13px; font-weight: 500; font-family: inherit; transition: all .15s; display: inline-flex; align-items: center; gap: 6px; }
        .btn-secondary:hover { border-color: var(--border-strong); color: var(--text-primary); background: var(--surface2); }
        .btn-ghost { background: none; border: none; border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 13px; color: var(--text-secondary); font-family: inherit; transition: all .15s; display: inline-flex; align-items: center; gap: 6px; }
        .btn-ghost:hover { color: var(--text-primary); background: var(--surface2); }
        .btn-danger { background: var(--danger); color: #fff; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 600; font-family: inherit; transition: background .15s; }
        .btn-danger:hover { background: var(--danger-hover); }
        .btn-enter { width: 100%; padding: 9px 0; background: var(--accent); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all .15s; margin-top: auto; }
        .btn-enter:hover { filter: brightness(1.1); }
        .icon-btn { background: none; border: none; cursor: pointer; padding: 5px; border-radius: 6px; color: var(--text-muted); transition: all .15s; display: inline-flex; align-items: center; justify-content: center; }
        .icon-btn:hover { background: var(--surface2); color: var(--text-primary); }
        .icon-btn-danger:hover { background: var(--danger-light); color: var(--danger); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .field { display: flex; flex-direction: column; gap: 5px; }
        .label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
        .input { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; font-size: 13px; color: var(--text-primary); font-family: inherit; outline: none; transition: border-color .15s, box-shadow .15s; width: 100%; }
        .input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
        .input:disabled { opacity: .55; cursor: not-allowed; background: var(--surface2); }
        .input option { background: var(--surface); color: var(--text-primary); }
        .cell-input { border-radius: 6px; padding: 6px 8px; }
        .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal-box { background: var(--surface); border-radius: 14px; border: 1px solid var(--border); padding: 28px; max-width: 400px; width: 100%; box-shadow: 0 24px 64px rgba(0,0,0,.15); }
        .modal-icon-danger { width: 44px; height: 44px; background: var(--danger-light); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--danger); margin-bottom: 16px; }
        .modal-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
        .modal-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
        .directory { padding: 32px; overflow: auto; flex: 1; }
        .directory-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
        .dir-search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 9px; padding: 8px 14px; background: var(--surface); min-width: 240px; }
        .dir-search input { background: none; border: none; outline: none; font-size: 13px; color: var(--text-primary); flex: 1; font-family: inherit; }
        .dir-search input::placeholder { color: var(--text-muted); }
        .empresa-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
        .empresa-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 1px 4px rgba(0,0,0,.04); transition: box-shadow .15s, transform .15s; animation: fadeUp .3s ease both; overflow: hidden; }
        .empresa-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.08); transform: translateY(-1px); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .empresa-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .empresa-avatar { width: 44px; height: 44px; background: var(--accent-light); color: var(--accent); font-size: 18px; font-weight: 800; border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .empresa-name { font-size: 15px; font-weight: 700; color: var(--text-primary); }
        .empresa-nif { font-size: 12px; color: var(--text-muted); }
        .empresa-address { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .empresa-stats { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
        .stat-pill { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); background: var(--surface2); border-radius: 99px; padding: 3px 9px; }
        .stat-pill-green { color: var(--success-text); background: var(--success-bg); }
        .add-empresa-card { border: 2px dashed var(--border); border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 20px; cursor: pointer; background: none; font-family: inherit; color: var(--text-muted); transition: all .15s; animation: fadeUp .3s ease both; min-height: 200px; }
        .add-empresa-card:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .list-wrap { flex: 1; overflow: auto; display: flex; flex-direction: column; }
        .list-topbar { display: flex; justify-content: space-between; align-items: center; padding: 24px 28px 16px; flex-shrink: 0; }
        .page-title { font-size: 20px; font-weight: 800; color: var(--text-primary); letter-spacing: -.4px; }
        .page-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .search-row { padding: 0 28px 16px; }
        .search-box { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 9px; padding: 8px 14px; background: var(--surface); max-width: 320px; }
        .search-icon { color: var(--text-muted); flex-shrink: 0; }
        .search-input { background: none; border: none; outline: none; font-size: 13px; color: var(--text-primary); width: 100%; font-family: inherit; }
        .search-input::placeholder { color: var(--text-muted); }
        .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; }
        .invoice-table-wrap { flex: 1; overflow: auto; padding: 0 28px 28px; }
        .invoice-table { width: 100%; border-collapse: collapse; }
        .invoice-table th { text-align: left; font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; padding: 8px 14px; border-bottom: 1px solid var(--border); }
        .invoice-table td { padding: 13px 14px; border-bottom: 1px solid var(--border); }
        .inv-row { cursor: pointer; transition: background .12s; }
        .inv-row:hover { background: var(--surface2); }
        .inv-num { font-size: 13px; font-weight: 600; color: var(--accent); }
        .editor-wrap { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .editor-topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; border-bottom: 1px solid var(--border); background: var(--surface); flex-shrink: 0; }
        .editor-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
        .editor-body { flex: 1; overflow: auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; }
        .editor-section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
        .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); margin-bottom: 14px; }
        .locked-banner { display: flex; align-items: center; gap: 10px; padding: 10px 24px; background: var(--success-bg); color: var(--success-text); font-size: 12px; font-weight: 500; flex-shrink: 0; border-bottom: 1px solid var(--border); }
        .status-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; display: inline-block; }
        .status-emitida { background: var(--success-bg); color: var(--success-text); }
        .status-borrador { background: var(--draft-bg); color: var(--draft-text); }
        .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
        .lines-table { width: 100%; border-collapse: collapse; }
        .lines-table th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); padding: 9px 12px; background: var(--surface2); text-align: right; }
        .lines-table th:first-child { text-align: left; }
        .lines-table td { padding: 6px 4px; border-top: 1px solid var(--border); }
        .line-row:hover { background: var(--surface2); }
        .totals-block { width: 280px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
        .total-row { display: flex; justify-content: space-between; padding: 9px 16px; font-size: 13px; color: var(--text-secondary); border-bottom: 1px solid var(--border); }
        .total-final { background: var(--text-primary); color: var(--surface); font-weight: 800; font-size: 15px; border: none; }
        .dark .total-final { background: var(--surface2); color: var(--text-primary); border-top: 2px solid var(--accent); }
        .qr-box { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: inline-flex; }
        .qr-url-row { display: flex; align-items: center; gap: 8px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; }
        .qr-url { font-size: 12px; color: var(--accent); font-family: monospace; }
        .toast { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-radius: 10px; font-size: 13px; font-weight: 500; color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.15); animation: toastIn .3s cubic-bezier(.34,1.56,.64,1); min-width: 260px; }
        @keyframes toastIn { from { opacity: 0; transform: translateX(30px) scale(.95); } to { opacity: 1; transform: none; } }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        input[type=number]::-webkit-inner-spin-button { opacity: .3; }
        input[type=date]::-webkit-calendar-picker-indicator { opacity: .5; }

        .mob-menu-btn { display: none; }
        .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 29; }

        @media (max-width: 768px) {
          .topbar { padding: 0 14px; }
          .topbar-brand { font-size: 14px; }
          .mob-menu-btn { display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: var(--text-secondary); padding: 6px; border-radius: 8px; }
          .mob-menu-btn:hover { background: var(--surface2); }
          .app { flex-direction: column; }
          .sidebar {
            position: fixed !important;
            top: 0; left: 0; bottom: 0;
            width: 260px !important;
            z-index: 30;
            transform: translateX(-100%);
            transition: transform .25s cubic-bezier(.4,0,.2,1);
            box-shadow: 4px 0 24px rgba(0,0,0,.15);
          }
          .sidebar.open { transform: translateX(0); }
          .sidebar-overlay.open { display: block; }
          .directory { padding: 16px; }
          .directory-header { flex-direction: column; gap: 12px; align-items: stretch; }
          .dir-search { min-width: unset; width: 100%; }
          .empresa-grid { grid-template-columns: 1fr; }
          .list-topbar { padding: 16px 16px 10px; flex-wrap: wrap; gap: 10px; }
          .search-row { padding: 0 16px 12px; }
          .search-box { max-width: 100%; }
          .invoice-table-wrap { padding: 0 16px 20px; }
          .invoice-table th:nth-child(3),
          .invoice-table td:nth-child(3),
          .invoice-table th:nth-child(4),
          .invoice-table td:nth-child(4) { display: none; }
          .editor-topbar { padding: 10px 14px; flex-wrap: wrap; gap: 8px; }
          .editor-body { padding: 14px; gap: 14px; }
          .editor-section { padding: 14px; }
          .form-grid { grid-template-columns: 1fr; }
          .field[style*="gridColumn"] { grid-column: 1 !important; }
          .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .lines-table { min-width: 520px; }
          .totals-block { width: 100%; }
          .modal-box { padding: 20px 16px; margin: 0 8px; }
          .modal-box[style*="width: 440px"] { width: auto !important; }
          .modal-backdrop { padding: 0; align-items: flex-start !important; }
          .qr-url-row { flex-wrap: wrap; }
          .qr-url { font-size: 10px; word-break: break-all; }
          .btn-primary, .btn-secondary { padding: 7px 12px; font-size: 12px; }
          .list-topbar .btn-primary { width: 100%; justify-content: center; }
        }

        @media (max-width: 480px) {
          .topbar-brand { font-size: 13px; }
          .empresa-grid { grid-template-columns: 1fr; }
          .editor-topbar > div:first-child { width: 100%; }
          .editor-topbar > div:last-child { width: 100%; justify-content: flex-end; }
          .invoice-table th:nth-child(5),
          .invoice-table td:nth-child(5) { display: none; }
        }
        @media print {
          body * { visibility: hidden !important; }
          #a4-print, #a4-print * { visibility: visible !important; }
          #a4-print { position: fixed; top: 0; left: 0; width: 100%; background: #fff !important; }
        }
      `}</style>

      <Toasts toasts={toasts} />

      {confirmDelete && (
        <ConfirmModal
          title={confirmDelete.type === "empresa" ? "Eliminar empresa" : "Eliminar factura"}
          description={confirmDelete.type === "empresa"
            ? "Se eliminarán la empresa y todas sus facturas. Esta acción no se puede deshacer."
            : "¿Seguro que quieres eliminar esta factura? Esta acción no se puede deshacer."}
          onConfirm={() => confirmDelete.type === "empresa" ? handleDeleteEmpresa(confirmDelete.id) : handleDeleteFactura(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {previewFactura && (() => {
        const f = facturas.find(x => x.id === previewFactura);
        const e = empresas.find(x => x.id === f?.empresaId);
        return f && e ? (
          <InvoicePreviewModal
            invoice={f} empresa={e}
            onClose={() => setPreviewFactura(null)}
            onPDF={handlePDF}
            pdfLoading={pdfLoading}
          />
        ) : null;
      })()}

      {showNewEmpresa && (
        <EmpresaFormModal
          empresa={editingEmpresa || { nombre: "", nif: "", direccion: "", logo: "" }}
          onChange={setEditingEmpresa}
          onSave={handleSaveEmpresa}
          onCancel={() => { setShowNewEmpresa(false); setEditingEmpresa(null); }}
        />
      )}

      <div className={`app ${dark ? "dark" : ""}`} style={{ background: "var(--bg)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
          <div className="topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {activeEmpresa && (
                <button className="mob-menu-btn" onClick={() => setSidebarOpen(o => !o)} title="Menú">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="17" y2="6" /><line x1="3" y1="11" x2="17" y2="11" /><line x1="3" y1="16" x2="17" y2="16" /></svg>
                </button>
              )}
              <span className="topbar-brand">Centro de Facturación</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {activeEmpresa && <span style={{ fontSize: 12, color: "var(--text-muted)", marginRight: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{activeEmpresa.nombre}</span>}
              <button className="icon-btn" onClick={() => setDark(d => !d)} title="Cambiar tema">
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="icon-btn" onClick={handleLogout} title="Cerrar sesión" style={{ color: "var(--danger)" }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, marginTop: 56, overflow: "hidden", height: "calc(100vh - 56px)" }}>

          {activeEmpresa && (
            <div className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
          )}

          {activeEmpresa && (
            <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
              {activeEmpresa.config_diseno && (
                <div style={{ height: 3, background: `linear-gradient(90deg, ${activeEmpresa.config_diseno.palette.primary}, ${activeEmpresa.config_diseno.palette.accent})` }} />
              )}
              <div className="sidebar-header">
                <button className="back-btn" onClick={() => { setActiveEmpresaId(null); setActiveFacturaId(null); setSideNav("facturas"); setSidebarOpen(false); }}>
                  <ArrowLeft size={12} /> Empresas Totales
                </button>
                <p className="sidebar-co-name" title={activeEmpresa.nombre}>{activeEmpresa.nombre}</p>
                <p className="sidebar-co-nif">{activeEmpresa.nif}</p>
              </div>
              <nav className="sidebar-nav">
                {[
                  { key: "facturas", label: "Facturas", icon: <ReceiptText size={15} /> },
                  { key: "configuracion", label: "Configuración", icon: <Settings size={15} /> },
                ].map(n => (
                  <button key={n.key} className={`nav-item ${sideNav === n.key ? "active" : ""}`}
                    onClick={() => { setSideNav(n.key); setActiveFacturaId(null); setSidebarOpen(false); }}>
                    {n.icon} {n.label}
                  </button>
                ))}
              </nav>
              <div style={{ padding: "12px 14px", borderTop: "1px solid var(--sidebar-border)" }}>
                <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Facturas emitidas</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>
                    {companyInvoices.filter(f => f.estado === "Emitida").length}
                    <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 400 }}> / {companyInvoices.length}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="main" style={{ background: "var(--bg)" }}>
            {!activeEmpresa ? (
              <div className="directory">
                <div className="directory-header">
                  <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", letterSpacing: -0.5, marginBottom: 4 }}>Empresas Totales</h1>
                    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{empresas.length} empresa{empresas.length !== 1 ? "s" : ""} registrada{empresas.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div className="dir-search">
                      <Search size={13} style={{ color: "var(--text-muted)" }} />
                      <input placeholder="Buscar empresa..." value={dirSearch} onChange={e => setDirSearch(e.target.value)} />
                    </div>
                    <button className="btn-primary" onClick={() => { setEditingEmpresa({ nombre: "", nif: "", direccion: "", logo: "" }); setShowNewEmpresa(true); }}>
                      <Plus size={14} /> Añadir empresa
                    </button>
                  </div>
                </div>
                <div className="empresa-grid">
                  {filteredEmpresas.map((e, i) => {
                    const inv = facturas.filter(f => f.empresaId === e.id);
                    return (
                      <EmpresaCard key={e.id} empresa={e} invoiceCount={inv.length} emitedCount={inv.filter(f => f.estado === "Emitida").length}
                        onEnter={id => { setActiveEmpresaId(id); setSideNav("facturas"); }}
                        onDelete={id => setConfirmDelete({ type: "empresa", id })}
                        delay={i * 50}
                      />
                    );
                  })}
                  <button className="add-empresa-card" style={{ animationDelay: `${filteredEmpresas.length * 50}ms` }}
                    onClick={() => { setEditingEmpresa({ nombre: "", nif: "", direccion: "", logo: "" }); setShowNewEmpresa(true); }}>
                    <Plus size={22} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Nueva empresa</span>
                  </button>
                </div>
                {filteredEmpresas.length === 0 && dirSearch && (
                  <p style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 40, fontSize: 13 }}>Sin resultados para "{dirSearch}"</p>
                )}
              </div>
            ) : sideNav === "configuracion" ? (
              <SettingsPanel
                empresa={activeEmpresa}
                onChange={updated => setEmpresas(p => p.map(e => e.id === updated.id ? updated : e))}
                onSave={async () => {
                  const emp = empresas.find(e => e.id === activeEmpresaId);
                  if (!emp) return;
                  await supabase.from("empresas").update({
                    nombre: emp.nombre, nif: emp.nif,
                    direccion: emp.direccion, logo: emp.logo,
                    config_diseno: emp.config_diseno,
                  }).eq("id", emp.id);
                  toast("Configuración guardada");
                }}
                onRegenDNA={async newDna => {
                  setEmpresas(p => p.map(e => e.id === activeEmpresaId ? { ...e, config_diseno: newDna } : e));
                  await supabase.from("empresas").update({ config_diseno: newDna }).eq("id", activeEmpresaId);
                  toast(`✨ Nuevo ADN: ${newDna.layout?.desc}`);
                }}
              />
            ) : activeFacturaId && activeFactura ? (
              <InvoiceEditor
                invoice={activeFactura}
                empresa={activeEmpresa}
                locked={isLocked}
                onChange={handleFacturaChange}
                onPersist={handleAutoPersist}
                onEmit={handleEmitFactura}
                onPreview={() => setPreviewFactura(activeFacturaId)}
                onBack={() => setActiveFacturaId(null)}
              />
            ) : (
              <InvoiceList
                facturas={companyInvoices}
                onSelect={id => setActiveFacturaId(id)}
                onNew={handleNewFactura}
                onDelete={id => setConfirmDelete({ type: "factura", id })}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
