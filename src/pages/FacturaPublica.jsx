/**
 * FacturaPublica.jsx
 * Ruta: /f/:uuid
 *
 * Página pública accesible por cualquier persona que escanee el QR.
 * No requiere login. La política RLS de Supabase permite leer
 * facturas con estado = 'Emitida' sin autenticación.
 * No expira nunca — el UUID es la clave de acceso permanente.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = n =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)

const fmtDate = d =>
  d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

// ── QR SVG (mismo algoritmo que en App.jsx) ───────────────────────────────────
function QRSvg({ id, size = 80 }) {
  const cells = 21, cs = size / cells
  const h = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const pat = Array.from({ length: cells }, (_, r) =>
    Array.from({ length: cells }, (_, c) => {
      if (r < 7 && c < 7) return r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4)
      if (r < 7 && c > cells-8) return r===0||r===6||c===cells-1||c===cells-7||(r>=2&&r<=4&&c>=cells-5&&c<=cells-3)
      if (r > cells-8 && c < 7) return r===cells-1||r===cells-7||c===0||c===6||(r>=cells-5&&r<=cells-3&&c>=2&&c<=4)
      return ((h*(r*cells+c+1)*2654435761)&1)===1
    })
  )
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {pat.flatMap((row, r) => row.map((on, c) =>
        on ? <rect key={`${r}-${c}`} x={c*cs} y={r*cs} width={cs} height={cs} fill="currentColor" /> : null
      ))}
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FacturaPublica() {
  const { uuid }          = useParams()
  const [factura, setFactura] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      try {
        // Consulta anónima — RLS permite SELECT en facturas Emitidas sin auth
        const { data, error: err } = await supabase
          .from('facturas')
          .select('*')
          .eq('id', uuid)
          .eq('estado', 'Emitida')
          .single()

        if (err || !data) {
          setError('Factura no encontrada o todavía no emitida.')
          return
        }

        setFactura(data)

        // empresa_snapshot guarda los datos del emisor en el momento de emisión
        // Para que el QR siempre muestre la factura exactamente como se emitió
        if (data.empresa_snapshot) {
          setEmpresa(data.empresa_snapshot)
        } else {
          // Fallback: intentar cargar la empresa (puede fallar si el usuario no está logueado)
          setEmpresa({ nombre: data.cliente_nombre || 'Emisor', nif: '', direccion: '' })
        }
      } catch (e) {
        setError('Error al cargar la factura.')
      } finally {
        setLoading(false)
      }
    }
    if (uuid) cargar()
  }, [uuid])

  // ── Loading ──
  if (loading) return (
    <div style={styles.center}>
      <div style={styles.spinner} />
      <p style={{ color: '#6B7280', fontSize: 14, marginTop: 16 }}>Verificando factura…</p>
    </div>
  )

  // ── Error ──
  if (error) return (
    <div style={styles.center}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{error}</p>
      <p style={{ fontSize: 13, color: '#9CA3AF' }}>Comprueba que el enlace QR sea correcto.</p>
    </div>
  )

  if (!factura) return null

  const items   = Array.isArray(factura.items) ? factura.items : []
  const dna     = empresa?.config_diseno
  const primary = dna?.palette?.primary || '#111827'
  const accent  = dna?.palette?.accent  || '#2563EB'
  const hFont   = dna?.fonts?.heading   || "'Plus Jakarta Sans', sans-serif"
  const bFont   = dna?.fonts?.body      || "'Plus Jakarta Sans', sans-serif"

  return (
    <div style={{ background: '#F9FAFB', minHeight: '100vh', padding: '32px 16px', fontFamily: bFont }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Verified badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#15803D', letterSpacing: 1, textTransform: 'uppercase' }}>
            Factura verificada
          </span>
          <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
            facturaismael.vercel.app
          </span>
        </div>

        {/* Invoice card */}
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

          {/* DNA color bar */}
          {dna && (
            <div style={{ height: 4, background: `linear-gradient(90deg, ${primary}, ${accent})` }} />
          )}

          {/* Header */}
          <div style={{ background: primary, padding: '28px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontFamily: bFont }}>
                Factura
              </p>
              <p style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: -0.5, fontFamily: hFont }}>
                {factura.numero}
              </p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, fontFamily: bFont }}>
                {fmtDate(factura.fecha)}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              {empresa?.logo_url
                ? <img src={empresa.logo_url} alt="logo" style={{ height: 40, objectFit: 'contain', filter: 'brightness(0) invert(1)', marginBottom: 6 }} />
                : <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: hFont }}>{empresa?.nombre}</p>
              }
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2, fontFamily: bFont }}>{empresa?.nif}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', whiteSpace: 'pre-line', fontFamily: bFont }}>{empresa?.direccion}</p>
            </div>
          </div>

          <div style={{ padding: '28px 36px' }}>

            {/* Meta row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20, marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid #F3F4F6' }}>
              <div>
                <p style={styles.metaLabel}>Facturar a</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', fontFamily: hFont }}>{factura.cliente_nombre || '—'}</p>
                {factura.cliente_nif && <p style={{ fontSize: 12, color: '#6B7280', fontFamily: bFont }}>{factura.cliente_nif}</p>}
                {factura.cliente_dir && <p style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'pre-line', fontFamily: bFont }}>{factura.cliente_dir}</p>}
              </div>
              <div>
                <p style={styles.metaLabel}>Estado</p>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: '#DCFCE7', color: '#15803D' }}>
                  ✓ Emitida
                </span>
              </div>
              <div>
                <p style={styles.metaLabel}>Total</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: primary, fontFamily: hFont }}>
                  {fmt(factura.total)}
                </p>
              </div>
            </div>

            {/* Encabezado libre */}
            {factura.encabezado && (
              <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20, fontStyle: 'italic', lineHeight: 1.7, fontFamily: bFont }}>
                {factura.encabezado}
              </p>
            )}

            {/* Lines table */}
            {items.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                  <thead>
                    <tr style={{ background: primary }}>
                      {['Concepto', 'Cant.', 'P. Unit.', 'IVA', 'Total'].map((h, i) => (
                        <th key={h} style={{ padding: '9px 10px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, color: '#fff', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600, fontFamily: bFont }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l, i) => {
                      const base  = (parseFloat(l.cantidad) || 0) * (parseFloat(l.precioUnitario) || 0)
                      const total = base + base * (parseFloat(l.iva) || 0) / 100
                      return (
                        <tr key={l.id || i} style={{ background: i % 2 ? '#F9FAFB' : '#fff', borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '11px 10px', fontSize: 13, color: '#111827', fontFamily: bFont }}>{l.concepto || '—'}</td>
                          <td style={{ padding: '11px 10px', fontSize: 12, color: '#6B7280', textAlign: 'right', fontFamily: bFont }}>{l.cantidad}</td>
                          <td style={{ padding: '11px 10px', fontSize: 12, color: '#6B7280', textAlign: 'right', fontFamily: bFont }}>{fmt(l.precioUnitario)}</td>
                          <td style={{ padding: '11px 10px', fontSize: 12, color: '#6B7280', textAlign: 'right', fontFamily: bFont }}>{l.iva}%</td>
                          <td style={{ padding: '11px 10px', fontSize: 13, color: '#111827', fontWeight: 700, textAlign: 'right', fontFamily: bFont }}>{fmt(total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals + QR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 20, marginBottom: 20 }}>
              {/* QR */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 10, display: 'inline-block', color: primary }}>
                  <QRSvg id={factura.id} size={80} />
                </div>

              </div>

              {/* Totals */}
              <div style={{ minWidth: 220, border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                <div style={styles.totalRow}>
                  <span>Subtotal</span>
                  <span>{fmt(factura.subtotal)}</span>
                </div>
                <div style={styles.totalRow}>
                  <span>IVA</span>
                  <span>{fmt(factura.iva)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: primary, color: '#fff', fontWeight: 800, fontSize: 16, fontFamily: hFont }}>
                  <span>TOTAL</span>
                  <span>{fmt(factura.total)}</span>
                </div>
              </div>
            </div>

            {/* Pie de página */}
            {factura.pie_pagina && (
              <p style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.7, whiteSpace: 'pre-line', paddingTop: 16, borderTop: '1px solid #F3F4F6', fontFamily: bFont }}>
                {factura.pie_pagina}
              </p>
            )}


          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#D1D5DB', marginTop: 20 }}>
          Esta factura es auténtica y fue emitida a través de Centro de Facturación.
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 480px) {
          div[style*="padding: '28px 36px'"] { padding: 20px 18px !important; }
        }
      `}</style>
    </div>
  )
}

// ── Shared micro-styles ───────────────────────────────────────────────────────
const styles = {
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif',
    padding: 24, textAlign: 'center',
  },
  spinner: {
    width: 36, height: 36, border: '3px solid #E5E7EB',
    borderTopColor: '#2563EB', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  metaLabel: {
    fontSize: 9, letterSpacing: 2, textTransform: 'uppercase',
    color: '#9CA3AF', marginBottom: 6, fontWeight: 600,
  },
  totalRow: {
    display: 'flex', justifyContent: 'space-between',
    padding: '9px 16px', fontSize: 13, color: '#6B7280',
    borderBottom: '1px solid #E5E7EB',
  },
}
