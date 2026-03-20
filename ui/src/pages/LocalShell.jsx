import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import {
  TerminalSquare,
  Play,
  Square,
  AlertTriangle,
  Info,
  LogOut,
} from 'lucide-react'

const API   = 'http://localhost:8000/api'
const WS    = 'ws://localhost:8000/api/ws/terminal'

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    idle:        { color: '#6B7280', label: 'No session' },
    connecting:  { color: '#EAB308', label: 'Connecting…' },
    connected:   { color: '#22C55E', label: 'Connected' },
    dead:        { color: '#EF4444', label: 'Session ended' },
    error:       { color: '#EF4444', label: 'Error' },
  }
  const { color, label } = map[status] ?? map.idle
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#94A3B8' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LocalShell() {
  const containerRef  = useRef(null)
  const termRef       = useRef(null)
  const fitRef        = useRef(null)
  const wsRef         = useRef(null)
  const resizeObsRef  = useRef(null)
  const sidRef        = useRef(null)

  const [status,   setStatus]   = useState('idle')   // idle | connecting | connected | dead | error
  const [errMsg,   setErrMsg]   = useState('')
  const [isRoot,   setIsRoot]   = useState(false)
  const [logPath,  setLogPath]  = useState('')
  const [sid,      setSid]      = useState(null)

  // ── Cleanup helper ─────────────────────────────────────────────────────────

  const cleanup = useCallback((keepSession = false) => {
    resizeObsRef.current?.disconnect()
    resizeObsRef.current = null

    if (wsRef.current) {
      wsRef.current.onclose = null   // prevent onclose firing during cleanup
      wsRef.current.close()
      wsRef.current = null
    }

    if (!keepSession && sidRef.current) {
      // Best-effort DELETE — don't await, page may be unloading
      fetch(`${API}/terminal/sessions/${sidRef.current}`, { method: 'DELETE' }).catch(() => {})
      sidRef.current = null
      setSid(null)
    }

    if (termRef.current) {
      termRef.current.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup])

  // ── Send resize frame to backend ───────────────────────────────────────────

  const sendResize = useCallback((dims) => {
    if (!dims || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    const json   = JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows })
    const bytes  = new TextEncoder().encode(json)
    const frame  = new Uint8Array(1 + bytes.length)
    frame[0]     = 0xFF          // resize frame marker
    frame.set(bytes, 1)
    wsRef.current.send(frame)
  }, [])

  // ── Start session ──────────────────────────────────────────────────────────

  const startSession = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') return

    setStatus('connecting')
    setErrMsg('')

    let newSid
    try {
      const res = await fetch(`${API}/terminal/sessions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cols: 220, rows: 50 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      newSid = data.sid
      sidRef.current = newSid
      setSid(newSid)
      setIsRoot(data.running_as_root ?? false)
      setLogPath(data.log_path ?? '')
    } catch (err) {
      setStatus('error')
      setErrMsg(`Failed to create session: ${err.message}`)
      return
    }

    // Mount xterm.js
    const term = new Terminal({
      cursorBlink:        true,
      cursorStyle:        'bar',
      fontSize:           13,
      fontFamily:         '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
      lineHeight:         1.4,
      letterSpacing:      0,
      scrollback:         5000,
      allowTransparency:  false,
      theme: {
        background:   '#0B0F1A',
        foreground:   '#E2E8F0',
        cursor:       '#38BDF8',
        cursorAccent: '#0B0F1A',
        selectionBackground: 'rgba(56, 189, 248, 0.25)',
        black:        '#1E293B',
        red:          '#F87171',
        green:        '#4ADE80',
        yellow:       '#FACC15',
        blue:         '#60A5FA',
        magenta:      '#C084FC',
        cyan:         '#22D3EE',
        white:        '#F1F5F9',
        brightBlack:  '#475569',
        brightRed:    '#FCA5A5',
        brightGreen:  '#86EFAC',
        brightYellow: '#FDE68A',
        brightBlue:   '#93C5FD',
        brightMagenta:'#D8B4FE',
        brightCyan:   '#67E8F9',
        brightWhite:  '#FFFFFF',
      },
    })

    const fitAddon      = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)
    // Defer first fit so the browser has painted the now-visible container
    requestAnimationFrame(() => {
      fitAddon.fit()
      sendResize(fitAddon.proposeDimensions())
    })
    termRef.current = term
    fitRef.current  = fitAddon

    // Open WebSocket
    const ws = new WebSocket(`${WS}/${newSid}`)
    ws.binaryType = 'arraybuffer'
    wsRef.current  = ws

    ws.onopen = () => {
      setStatus('connected')
      sendResize(fitAddon.proposeDimensions())
    }

    ws.onmessage = (e) => {
      term.write(new Uint8Array(e.data))
    }

    ws.onerror = () => {
      setStatus('error')
      setErrMsg('WebSocket connection failed.')
    }

    ws.onclose = (e) => {
      // 4410 = shell exited naturally
      setStatus('dead')
      term.write('\r\n\x1b[38;5;240m[session closed]\x1b[0m\r\n')
      wsRef.current = null
    }

    // Keyboard input → PTY
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(new TextEncoder().encode(data))
      }
    })

    // Resize observer — keep terminal filling its container
    const obs = new ResizeObserver(() => {
      if (!fitRef.current) return
      try {
        fitAddon.fit()
        sendResize(fitAddon.proposeDimensions())
      } catch (_) {}
    })
    obs.observe(containerRef.current)
    resizeObsRef.current = obs
  }, [status, sendResize])

  // ── Kill session ───────────────────────────────────────────────────────────

  const killSession = useCallback(async () => {
    const currentSid = sidRef.current
    cleanup()
    setStatus('idle')
    setSid(null)
    setIsRoot(false)
    setLogPath('')

    if (currentSid) {
      try {
        await fetch(`${API}/terminal/sessions/${currentSid}`, { method: 'DELETE' })
      } catch (_) {}
    }
  }, [cleanup])

  // ── Render ─────────────────────────────────────────────────────────────────

  const isActive = status === 'connected' || status === 'dead'

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      padding:       '1.25rem',
      gap:           '0.75rem',
      overflow:      'hidden',
    }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <TerminalSquare size={18} color="#4F8EF7" />
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#E8EAF0' }}>
            Local Shell
          </h1>
          <span style={{
            fontSize:      '0.65rem',
            fontWeight:    700,
            padding:       '2px 6px',
            borderRadius:  '3px',
            background:    '#78350F',
            color:         '#FDE68A',
            letterSpacing: '0.05em',
          }}>
            DEVELOPER
          </span>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* ── Warning banner ───────────────────────────────────────────────── */}
      <div style={{
        display:      'flex',
        alignItems:   'flex-start',
        gap:          '0.6rem',
        padding:      '0.6rem 0.85rem',
        borderRadius: '6px',
        border:       '1px solid #44330A',
        background:   '#1C1507',
        flexShrink:   0,
      }}>
        <AlertTriangle size={14} color="#FBBF24" style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#D4A843', lineHeight: 1.5 }}>
          This is a local PTY shell running on <strong>this machine only</strong> as{' '}
          <strong>{isRoot ? 'root' : 'current user'}</strong>.
          It is not SSH. It is not accessible remotely.
          All session output is logged.
          {isRoot && (
            <span style={{ color: '#FCA5A5', fontWeight: 600 }}>
              {' '}⚠ Running as root — exercise caution.
            </span>
          )}
        </p>
      </div>

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        '0.6rem',
        flexShrink: 0,
      }}>
        {(status === 'idle' || status === 'error' || status === 'dead') && (
          <button
            onClick={startSession}
            style={{
              display:       'flex',
              alignItems:    'center',
              gap:           '6px',
              padding:       '6px 14px',
              borderRadius:  '6px',
              border:        'none',
              background:    '#2563EB',
              color:         '#fff',
              fontSize:      '0.82rem',
              fontWeight:    500,
              cursor:        'pointer',
            }}
          >
            <Play size={13} />
            Start Session
          </button>
        )}

        {status === 'connecting' && (
          <button disabled style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '6px',
            padding:      '6px 14px',
            borderRadius: '6px',
            border:       'none',
            background:   '#1E3A5F',
            color:        '#94A3B8',
            fontSize:     '0.82rem',
            cursor:       'not-allowed',
          }}>
            <Play size={13} />
            Connecting…
          </button>
        )}

        {(status === 'connected') && (
          <button
            onClick={killSession}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
              padding:      '6px 14px',
              borderRadius: '6px',
              border:       '1px solid #7F1D1D',
              background:   '#1C0A0A',
              color:        '#FCA5A5',
              fontSize:     '0.82rem',
              fontWeight:   500,
              cursor:       'pointer',
            }}
          >
            <Square size={13} />
            Terminate
          </button>
        )}

        {status === 'dead' && (
          <button
            onClick={killSession}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '6px',
              padding:      '6px 14px',
              borderRadius: '6px',
              border:       '1px solid #374151',
              background:   'transparent',
              color:        '#94A3B8',
              fontSize:     '0.82rem',
              cursor:       'pointer',
            }}
          >
            <LogOut size={13} />
            Clear
          </button>
        )}

        {errMsg && (
          <span style={{ fontSize: '0.78rem', color: '#FCA5A5', marginLeft: 4 }}>
            {errMsg}
          </span>
        )}
      </div>

      {/* ── Terminal viewport ─────────────────────────────────────────────── */}
      <div style={{
        flex:         1,
        minHeight:    0,           // critical — lets flex child shrink below content size
        borderRadius: '8px',
        border:       `1px solid ${isActive ? '#1E3A5F' : '#1E293B'}`,
        overflow:     'hidden',
        background:   '#0B0F1A',
        position:     'relative',
      }}>
        {/* Idle placeholder — shown on top, does not affect container layout */}
        {status === 'idle' && (
          <div style={{
            position:       'absolute',
            inset:          0,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            color:          '#475569',
            pointerEvents:  'none',
          }}>
            <TerminalSquare size={40} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: '0.85rem' }}>No active session</p>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem' }}>Click <strong>Start Session</strong> to open a shell</p>
          </div>
        )}

        {/* xterm.js mounts here — always block so FitAddon can measure real dimensions */}
        <div
          ref={containerRef}
          style={{
            width:      '100%',
            height:     '100%',
            padding:    '4px',
            visibility: status === 'idle' ? 'hidden' : 'visible',
          }}
        />
      </div>

      {/* ── Session metadata footer ───────────────────────────────────────── */}
      {isActive && (
        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        '1.5rem',
          flexShrink: 0,
          flexWrap:   'wrap',
        }}>
          <MetaItem label="Session" value={sid ?? '—'} mono />
          {logPath && (
            <MetaItem label="Log" value={logPath} mono />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#475569' }}>
            <Info size={11} />
            Session output is logged locally. Log is cleared on reboot.
          </div>
        </div>
      )}
    </div>
  )
}

function MetaItem({ label, value, mono }) {
  return (
    <span style={{ fontSize: '0.72rem', color: '#475569', display: 'flex', gap: '4px' }}>
      <span style={{ color: '#64748B' }}>{label}:</span>
      <span style={{ color: '#94A3B8', fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value}
      </span>
    </span>
  )
}
