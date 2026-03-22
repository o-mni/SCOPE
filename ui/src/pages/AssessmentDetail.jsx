import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Play, Square, Download, Trash2, ChevronRight,
  ChevronDown, RotateCcw, CheckCircle2, SkipForward, NotebookPen,
  ShieldCheck, AlertCircle, Network, Shield, Users, Layers, Key,
  PlayCircle, FileText, Map, ExternalLink, RefreshCw,
} from 'lucide-react'
import {
  StatusBadge, SeverityBadge, FindingStatusBadge, RunStatusBadge,
  TaskStatusBadge, PriorityBadge,
} from '../components/shared/Badge'
import ConfirmModal from '../components/shared/ConfirmModal'
import { useToast } from '../App'

const API = 'http://localhost:8000/api'

const PLAYBOOKS = [
  { value: 'linux-baseline',   label: 'Linux Baseline (11 modules)' },
  { value: 'ssh-hardening',    label: 'SSH Hardening (3 modules)' },
  { value: 'network-exposure', label: 'Network Exposure (2 modules)' },
  { value: 'user-accounts',    label: 'User Accounts (2 modules)' },
  { value: 'file-permissions', label: 'File Permissions (2 modules)' },
]

const DOMAIN_META = {
  network:           { label: 'Network',             Icon: Network  },
  system_hardening:  { label: 'System Hardening',    Icon: Shield   },
  identity_access:   { label: 'Identity & Access',   Icon: Users    },
  software_services: { label: 'Software & Services', Icon: Layers   },
  secrets_keys:      { label: 'Secrets & Keys',      Icon: Key      },
  other:             { label: 'Other',                Icon: ShieldCheck },
}

// SSE event → console colour + prefix
const LINE_STYLES = {
  task_start:       { color: '#60A5FA', prefix: '▷ ' },
  preflight_start:  { color: '#94A3B8', prefix: '· ' },
  preflight_info:   { color: '#64748B', prefix: '  ' },
  preflight_warn:   { color: '#FBBF24', prefix: '⚠ ' },
  preflight_error:  { color: '#F87171', prefix: '✗ ' },
  module_start:     { color: '#94A3B8', prefix: '  ' },
  module_done:      { color: '#4ADE80', prefix: '  ' },
  finding_critical: { color: '#F87171', prefix: '  ' },
  finding:          { color: '#FACC15', prefix: '  ' },
  info:             { color: '#475569', prefix: '  ' },
  error:            { color: '#F87171', prefix: '✗ ' },
  dry_run:          { color: '#64748B', prefix: '○ ' },
  divider:          { color: '#1E293B', prefix: '──' },
  task_complete:    { color: '#4ADE80', prefix: '✓ ' },
}

function formatDate(ts) {
  if (!ts) return 'Never'
  const d = new Date(ts)
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  )
}

function formatDateShort(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDuration(ms) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ── Mini SSE console (reused by DomainSection and TaskRow) ───────────────────

function MiniConsole({ lines, running }) {
  const bottomRef = useRef(null)
  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  if (lines.length === 0) return null
  return (
    <div
      style={{
        maxHeight: '220px',
        overflowY: 'auto',
        padding: '0.6rem 0.75rem',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: '0.7rem',
        lineHeight: 1.7,
        backgroundColor: '#080B14',
        borderTop: '1px solid #1E293B',
      }}
    >
      {lines.map(line => {
        const style = LINE_STYLES[line.type] || LINE_STYLES.info
        return (
          <div key={line.id} style={{ color: style.color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {style.prefix}{line.message}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

// ── SSE runner hook (shared by RunAllPanel and DomainSection) ─────────────────

function useSseRunner(onComplete) {
  const [running,  setRunning]  = useState(false)
  const [lines,    setLines]    = useState([])
  const [expanded, setExpanded] = useState(false)
  const esRef = useRef(null)

  const appendLine = (type, message) =>
    setLines(prev => [...prev, { type, message, id: Date.now() + Math.random() }])

  const start = useCallback(async (body) => {
    if (running) return
    setRunning(true); setLines([]); setExpanded(true)
    try {
      const res = await fetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { task_id } = await res.json()
      const es = new EventSource(`${API}/tasks/${task_id}/stream`)
      esRef.current = es
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'done') {
            es.close(); esRef.current = null; setRunning(false); onComplete?.(); return
          }
          if (data.type === 'divider') { appendLine('divider', '──────────────────────────────'); return }
          appendLine(data.type, data.message || '')
        } catch (_) {}
      }
      es.onerror = () => {
        es.close(); esRef.current = null; setRunning(false)
        appendLine('error', 'Connection to server lost.')
      }
    } catch (err) {
      appendLine('error', `Failed: ${err.message}`)
      setRunning(false)
    }
  }, [running, onComplete])

  const stop = () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
    setRunning(false)
    appendLine('info', '  Cancelled by user.')
  }

  const clear = () => { setLines([]); setExpanded(false) }

  return { running, lines, expanded, setExpanded, start, stop, clear }
}

// ── RunAllPanel — shown when assessment has modules defined ───────────────────

function RunAllPanel({ assessment, domains, onRunComplete }) {
  const { running, lines, expanded, setExpanded, start, stop, clear } = useSseRunner(onRunComplete)

  const hasModules = assessment.moduleNames && assessment.moduleNames.length > 0

  // Legacy fallback: assessment created before wizard existed
  if (!hasModules) {
    return <LegacyRunConsole assessmentId={assessment.id} onRunComplete={onRunComplete} />
  }

  // Which domains does this assessment cover?
  const coveredDomains = domains.filter(d =>
    d.modules.some(m => assessment.moduleNames.includes(m.name))
  )

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3"
        style={{ borderBottom: (expanded && lines.length > 0) ? '1px solid #2A2D3A' : 'none' }}
      >
        <span className="text-sm font-medium" style={{ color: '#E8EAF0' }}>
          Run Assessment
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#2A2D3A', color: '#6B7280' }}>
          {assessment.moduleNames.length} modules · {coveredDomains.length} domains
        </span>

        <div className="flex items-center gap-2 ml-2">
          {!running ? (
            <button
              onClick={() => start({ task: 'run_assessment', assessmentId: assessment.id })}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium hover:brightness-110"
              style={{ backgroundColor: '#3ECF8E', color: '#fff' }}
            >
              <Play size={13} /> Run All
            </button>
          ) : (
            <button
              onClick={stop}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'rgba(229,83,75,0.15)', border: '1px solid rgba(229,83,75,0.3)', color: '#FCA5A5' }}
            >
              <Square size={13} /> Stop
            </button>
          )}
          {lines.length > 0 && !running && (
            <button
              onClick={clear}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
              style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
            >
              <RotateCcw size={11} /> Clear
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {running && <span style={{ fontSize: '0.75rem', color: '#FBBF24' }}>● Running…</span>}
          {lines.length > 0 && (
            <button onClick={() => setExpanded(v => !v)} style={{ color: '#6B7280' }}>
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>
      </div>

      {expanded && lines.length > 0 && (
        <div
          style={{
            height: '300px', overflowY: 'auto',
            padding: '0.75rem 1rem',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '0.75rem', lineHeight: 1.7,
            backgroundColor: '#0B0F1A',
          }}
        >
          {lines.map(line => {
            const style = LINE_STYLES[line.type] || LINE_STYLES.info
            return (
              <div key={line.id} style={{ color: style.color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {style.prefix}{line.message}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── LegacyRunConsole — fallback for assessments without moduleNames ────────────

function LegacyRunConsole({ assessmentId, onRunComplete }) {
  const [playbook, setPlaybook] = useState('linux-baseline')
  const { running, lines, expanded, setExpanded, start, stop, clear } = useSseRunner(onRunComplete)

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3"
        style={{ borderBottom: (expanded && lines.length > 0) ? '1px solid #2A2D3A' : 'none' }}
      >
        <select
          value={playbook}
          onChange={e => setPlaybook(e.target.value)}
          disabled={running}
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A', color: '#E8EAF0', opacity: running ? 0.5 : 1 }}
        >
          {PLAYBOOKS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>

        {!running ? (
          <button
            onClick={() => start({ task: 'run_playbook', playbook, assessmentId })}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: '#3ECF8E', color: '#fff' }}
          >
            <Play size={13} /> Run Now
          </button>
        ) : (
          <button
            onClick={stop}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'rgba(229,83,75,0.15)', border: '1px solid rgba(229,83,75,0.3)', color: '#FCA5A5' }}
          >
            <Square size={13} /> Stop
          </button>
        )}

        {lines.length > 0 && !running && (
          <button
            onClick={clear}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
            style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
          >
            <RotateCcw size={11} /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {running && <span style={{ fontSize: '0.75rem', color: '#FBBF24' }}>● Running…</span>}
          {lines.length > 0 && (
            <button onClick={() => setExpanded(v => !v)} style={{ color: '#6B7280' }}>
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>
      </div>

      {expanded && lines.length > 0 && (
        <div
          style={{
            height: '300px', overflowY: 'auto',
            padding: '0.75rem 1rem',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '0.75rem', lineHeight: 1.7,
            backgroundColor: '#0B0F1A',
          }}
        >
          {lines.map(line => {
            const style = LINE_STYLES[line.type] || LINE_STYLES.info
            return (
              <div key={line.id} style={{ color: style.color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {style.prefix}{line.message}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Individual task row ────────────────────────────────────────────────────────

function TaskRow({ task, assessmentId, onRefresh }) {
  const [expanded,     setExpanded]     = useState(false)
  const [running,      setRunning]      = useState(false)
  const [lines,        setLines]        = useState([])
  const [notes,        setNotes]        = useState(task.notes || '')
  const [notesSaving,  setNotesSaving]  = useState(false)
  const esRef = useRef(null)

  const appendLine = (type, message) =>
    setLines(prev => [...prev, { type, message, id: Date.now() + Math.random() }])

  const runTask = async () => {
    if (running || task.status === 'blocked') return
    setRunning(true)
    setLines([])
    setExpanded(true)
    try {
      const res = await fetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'run_task',
          module: task.moduleName,
          assessmentId,
          checklistTaskId: task.id,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { task_id } = await res.json()
      const es = new EventSource(`${API}/tasks/${task_id}/stream`)
      esRef.current = es
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'done') {
            es.close(); esRef.current = null; setRunning(false); onRefresh(); return
          }
          if (data.type === 'divider') { appendLine('divider', '──────────────────────────────'); return }
          appendLine(data.type, data.message || '')
        } catch (_) {}
      }
      es.onerror = () => {
        es.close(); esRef.current = null; setRunning(false)
        appendLine('error', 'Connection lost.')
      }
    } catch (err) {
      appendLine('error', `Failed: ${err.message}`)
      setRunning(false)
    }
  }

  const stopTask = () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
    setRunning(false)
    appendLine('info', '  Cancelled by user.')
  }

  const saveNotes = async () => {
    setNotesSaving(true)
    await fetch(`${API}/assessments/${assessmentId}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setNotesSaving(false)
  }

  const skipTask = async () => {
    await fetch(`${API}/assessments/${assessmentId}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: task.status === 'skipped' ? 'ready' : 'skipped' }),
    })
    onRefresh()
  }

  const markValidated = async () => {
    await fetch(`${API}/assessments/${assessmentId}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manuallyValidated: true }),
    })
    onRefresh()
  }

  const canRun    = !running && task.status !== 'blocked' && task.status !== 'skipped'
  const isBlocked = task.status === 'blocked'
  const isSkipped = task.status === 'skipped'

  return (
    <>
      {/* Main row */}
      <div
        className="grid items-center px-4 py-3 cursor-pointer table-row-hover"
        style={{
          gridTemplateColumns: '32px 1fr 90px 80px 60px 80px 110px 100px',
          borderBottom: '1px solid #2A2D3A',
          opacity: isSkipped ? 0.5 : 1,
        }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Expand chevron */}
        <div style={{ color: '#6B7280' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>

        {/* Title + category */}
        <div>
          <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{task.title}</p>
          <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{task.category}</p>
        </div>

        {/* Status */}
        <div><TaskStatusBadge status={running ? 'running' : task.status} /></div>

        {/* Priority */}
        <div><PriorityBadge priority={task.priority} /></div>

        {/* Mode */}
        <div className="text-xs" style={{ color: '#6B7280' }}>
          {task.automationLevel === 'auto' ? 'Auto' : task.automationLevel === 'semi_auto' ? 'Semi' : 'Manual'}
        </div>

        {/* Findings */}
        <div className="text-sm font-medium" style={{ color: task.findingCount > 0 ? '#FACC15' : '#6B7280' }}>
          {task.findingCount > 0 ? `${task.findingCount} ⚑` : '—'}
        </div>

        {/* Last run */}
        <div className="text-xs" style={{ color: '#6B7280' }}>
          {task.lastRunAt ? formatDateShort(task.lastRunAt) : '—'}
        </div>

        {/* Run button */}
        <div onClick={e => e.stopPropagation()}>
          {running ? (
            <button
              onClick={stopTask}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ backgroundColor: 'rgba(229,83,75,0.12)', color: '#FCA5A5', border: '1px solid rgba(229,83,75,0.25)' }}
            >
              <Square size={10} /> Stop
            </button>
          ) : canRun ? (
            <button
              onClick={runTask}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium hover:brightness-110"
              style={{ backgroundColor: 'rgba(62,207,142,0.12)', color: '#3ECF8E', border: '1px solid rgba(62,207,142,0.25)' }}
            >
              <Play size={10} /> Run
            </button>
          ) : isBlocked ? (
            <span className="text-xs" style={{ color: '#6B728050' }}>Blocked</span>
          ) : null}
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div
          style={{
            backgroundColor: '#13161F',
            borderBottom: '1px solid #2A2D3A',
            padding: '1rem 1.25rem 1rem calc(1rem + 32px)',
          }}
        >
          <div className="flex flex-wrap gap-6">
            {/* Left: description + notes */}
            <div className="flex-1 min-w-64 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Description</p>
                <p className="text-sm" style={{ color: '#94A3B8' }}>{task.title}</p>
              </div>

              {isBlocked && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ backgroundColor: 'rgba(229,83,75,0.08)', border: '1px solid rgba(229,83,75,0.2)' }}>
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#E5534B' }} />
                  <p className="text-xs" style={{ color: '#E5534B' }}>
                    {task.requiresRoot
                      ? 'Requires root — restart SCOPE with sudo for this module.'
                      : 'Required tools or files unavailable on this system.'}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: '#6B7280' }}>
                  <NotebookPen size={10} className="inline mr-1" />Notes
                </p>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add analyst notes…"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A', color: '#E8EAF0' }}
                />
                <button
                  onClick={saveNotes}
                  disabled={notesSaving}
                  className="mt-1.5 px-3 py-1 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: '#2A2D3A', color: '#E8EAF0', opacity: notesSaving ? 0.6 : 1 }}
                >
                  {notesSaving ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </div>

            {/* Right: meta + actions */}
            <div className="space-y-3 min-w-48">
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Last Run</p>
                <p className="text-sm" style={{ color: '#E8EAF0' }}>{formatDate(task.lastRunAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Module</p>
                <p className="text-xs font-mono" style={{ color: '#6B7280' }}>{task.moduleName}</p>
              </div>
              {task.manuallyValidated && (
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={13} style={{ color: '#3ECF8E' }} />
                  <span className="text-xs" style={{ color: '#3ECF8E' }}>Manually validated</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {!task.manuallyValidated && task.status !== 'skipped' && (
                  <button
                    onClick={markValidated}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: 'rgba(62,207,142,0.1)', color: '#3ECF8E', border: '1px solid rgba(62,207,142,0.2)' }}
                  >
                    <CheckCircle2 size={12} /> Mark Validated
                  </button>
                )}
                <button
                  onClick={skipTask}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: 'rgba(107,114,128,0.1)', color: '#6B7280', border: '1px solid rgba(107,114,128,0.2)' }}
                >
                  <SkipForward size={12} />
                  {isSkipped ? 'Restore' : 'Skip'}
                </button>
              </div>
            </div>
          </div>

          {/* Mini console */}
          {(running || lines.length > 0) && (
            <div className="mt-3 rounded-lg overflow-hidden" style={{ border: '1px solid #1E293B' }}>
              {lines.length > 0 && !running && (
                <div className="flex justify-end px-2 py-1" style={{ backgroundColor: '#080B14' }}>
                  <button
                    onClick={() => setLines([])}
                    className="text-xs"
                    style={{ color: '#475569' }}
                  >
                    clear
                  </button>
                </div>
              )}
              <MiniConsole lines={lines} running={running} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── Domain section within checklist ───────────────────────────────────────────

function DomainSection({ domainId, tasks, assessmentId, onRefresh }) {
  const [collapsed, setCollapsed] = useState(false)
  const { running, lines, expanded: consoleExpanded, setExpanded: setConsoleExpanded, start, stop, clear } = useSseRunner(onRefresh)

  const meta = DOMAIN_META[domainId] || DOMAIN_META.other
  const { Icon } = meta

  const completed = tasks.filter(t => t.status === 'completed' || t.manuallyValidated).length
  const domainPct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
      {/* Domain header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        style={{ borderBottom: collapsed ? 'none' : '1px solid #2A2D3A' }}
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ backgroundColor: '#2A2D3A' }}>
          <Icon size={14} style={{ color: '#94A3B8' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>{meta.label}</span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#2A2D3A', color: '#6B7280' }}>
              {tasks.length} task{tasks.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs" style={{ color: domainPct >= 80 ? '#3ECF8E' : domainPct >= 40 ? '#FBBF24' : '#6B7280' }}>
              {domainPct}%
            </span>
          </div>
          {/* Mini progress bar */}
          <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: '#0F1117', width: '120px' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${domainPct}%`,
                backgroundColor: domainPct >= 80 ? '#3ECF8E' : domainPct >= 40 ? '#FBBF24' : '#E5534B',
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {!running ? (
            <button
              onClick={() => start({ task: 'run_domain', assessmentId, domainId })}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium hover:brightness-110"
              style={{ backgroundColor: 'rgba(62,207,142,0.1)', color: '#3ECF8E', border: '1px solid rgba(62,207,142,0.25)' }}
            >
              <PlayCircle size={12} /> Run Domain
            </button>
          ) : (
            <button
              onClick={stop}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium"
              style={{ backgroundColor: 'rgba(229,83,75,0.12)', color: '#FCA5A5', border: '1px solid rgba(229,83,75,0.25)' }}
            >
              <Square size={10} /> Stop
            </button>
          )}
          {running && <span style={{ fontSize: '0.7rem', color: '#FBBF24' }}>● Running</span>}
        </div>

        <div style={{ color: '#6B7280', marginLeft: '4px' }}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Domain task rows */}
      {!collapsed && (
        <>
          {/* Table header */}
          <div
            className="grid px-4 py-2 text-xs font-semibold uppercase tracking-wider"
            style={{
              gridTemplateColumns: '32px 1fr 90px 80px 60px 80px 110px 100px',
              borderBottom: '1px solid #1E293B',
              color: '#475569',
              backgroundColor: '#13161F',
            }}
          >
            <div /><div>Task</div><div>Status</div><div>Priority</div>
            <div>Mode</div><div>Findings</div><div>Last Run</div><div />
          </div>
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} assessmentId={assessmentId} onRefresh={onRefresh} />
          ))}
          {/* Domain SSE console */}
          {(running || lines.length > 0) && (
            <div>
              {lines.length > 0 && (
                <div
                  className="flex items-center justify-between px-3 py-1"
                  style={{ backgroundColor: '#080B14', borderTop: '1px solid #1E293B' }}
                >
                  <span style={{ fontSize: '0.65rem', color: '#475569' }}>Domain run output</span>
                  {!running && (
                    <button onClick={clear} style={{ fontSize: '0.65rem', color: '#475569' }}>clear</button>
                  )}
                </div>
              )}
              <MiniConsole lines={lines} running={running} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Report / Strategy tab ───────────────────────────────────────────────────

function ReportTab({ assessment, reportType, addToast }) {
  const [templates,     setTemplates]     = useState([])
  const [selectedId,    setSelectedId]    = useState(null)
  const [generating,    setGenerating]    = useState(false)
  const [lastReport,    setLastReport]    = useState(null)

  const defaultKey = reportType === 'report' ? 'templateId' : 'strategyTemplateId'
  const filterType = reportType === 'report' ? 'report' : 'strategy'
  const labelTitle = reportType === 'report' ? 'Security Assessment Report' : 'Strategy Plan'
  const labelIcon  = reportType === 'report' ? FileText : Map

  useEffect(() => {
    fetch(`${API}/templates`)
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(data => {
        const filtered = (data.templates || []).filter(
          t => t.templateType === filterType || t.templateType === 'both'
        )
        setTemplates(filtered)
        // Pre-select from assessment or fall back to first
        const saved = assessment[defaultKey]
        if (saved && filtered.find(t => t.id === saved)) {
          setSelectedId(saved)
        } else if (filtered.length > 0) {
          setSelectedId(filtered[0].id)
        }
      })
      .catch(() => {})
  }, [assessment.id, reportType])

  const handleGenerate = async () => {
    if (!selectedId) return
    setGenerating(true)
    try {
      const res = await fetch(`${API}/reports/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessment_id: assessment.id,
          template_id:   selectedId,
          report_type:   reportType,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const report = await res.json()
      setLastReport(report)
      addToast(`${labelTitle} generated`, 'success')
    } catch (err) {
      addToast(`Render failed: ${err.message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handlePreview = () => {
    if (!selectedId) return
    window.open(`${API}/templates/${selectedId}/preview/${reportType}`, '_blank')
  }

  const LabelIcon = labelIcon

  return (
    <div className="space-y-5">
      {/* Template picker */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #2A2D3A' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LabelIcon size={15} style={{ color: '#6B7280' }} />
              <h3 className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>Template</h3>
            </div>
            <button
              onClick={() => window.open('/settings', '_self')}
              className="text-xs transition-colors hover:text-white"
              style={{ color: '#4F8EF7' }}
            >
              Manage templates ↗
            </button>
          </div>
          <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
            Choose which template to use for this {labelTitle.toLowerCase()}.
          </p>
        </div>

        <div className="p-5 space-y-2">
          {templates.length === 0 ? (
            <p className="text-sm" style={{ color: '#6B7280' }}>No {filterType} templates installed.</p>
          ) : (
            templates.map(t => (
              <label
                key={t.id}
                className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                style={{
                  backgroundColor: selectedId === t.id ? 'rgba(79,142,247,0.07)' : 'transparent',
                  border: `1px solid ${selectedId === t.id ? 'rgba(79,142,247,0.3)' : '#2A2D3A'}`,
                }}
              >
                <input
                  type="radio"
                  name={`template-${reportType}`}
                  value={t.id}
                  checked={selectedId === t.id}
                  onChange={() => setSelectedId(t.id)}
                  className="mt-0.5 accent-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{t.name}</span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-mono"
                      style={{ backgroundColor: '#0F1117', color: '#6B7280', border: '1px solid #2A2D3A' }}
                    >
                      v{t.version}
                    </span>
                    {t.builtin && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(100,116,139,0.15)', color: '#64748B', border: '1px solid rgba(100,116,139,0.2)' }}
                      >
                        built-in
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#6B7280' }}>
                      {t.description.length > 120 ? t.description.slice(0, 120) + '…' : t.description}
                    </p>
                  )}
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={!selectedId || generating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#4F8EF7', color: '#fff' }}
        >
          {generating
            ? <><RefreshCw size={14} className="animate-spin" /> Generating…</>
            : <><FileText size={14} /> Generate {labelTitle}</>
          }
        </button>

        {selectedId && (
          <button
            onClick={handlePreview}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
            style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
          >
            <ExternalLink size={13} /> Preview template
          </button>
        )}
      </div>

      {/* Last generated report */}
      {lastReport && (
        <div
          className="flex items-center justify-between p-4 rounded-xl"
          style={{ backgroundColor: 'rgba(62,207,142,0.05)', border: '1px solid rgba(62,207,142,0.2)' }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: '#3ECF8E' }}>Report generated</p>
            <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
              {lastReport.name} · {lastReport.size}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open(`${API}/reports/${lastReport.id}/view`, '_blank')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
              style={{ color: '#4F8EF7', border: '1px solid #2A2D3A' }}
            >
              <ExternalLink size={12} /> Open
            </button>
            <a
              href={`${API}/reports/${lastReport.id}/download`}
              download
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
              style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
            >
              <Download size={12} /> Download
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Checklist tab ──────────────────────────────────────────────────────────────

function ChecklistTab({ tasks, coverage, assessmentId, onRefresh }) {
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')

  const filtered = tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false
    return true
  })

  // ── Empty state ────────────────────────────────────────────────────────────
  if (tasks.length === 0) {
    return (
      <div
        className="rounded-xl p-10 text-center"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
      >
        <ShieldCheck size={32} className="mx-auto mb-3" style={{ color: '#6B7280' }} />
        <h3 className="text-sm font-semibold mb-1" style={{ color: '#E8EAF0' }}>No checklist yet</h3>
        <p className="text-xs" style={{ color: '#6B7280' }}>
          Create a new assessment using the wizard to generate a structured checklist automatically.
        </p>
      </div>
    )
  }

  // ── Group tasks by domain ──────────────────────────────────────────────────
  const byDomain = {}
  const domainOrder = Object.keys(DOMAIN_META)
  tasks.forEach(t => {
    const key = t.domainId || 'other'
    if (!byDomain[key]) byDomain[key] = []
    byDomain[key].push(t)
  })

  // Domain order: canonical order first, then any extras
  const domainKeys = [
    ...domainOrder.filter(k => byDomain[k]),
    ...Object.keys(byDomain).filter(k => !domainOrder.includes(k)),
  ]

  const pct = coverage?.pct ?? 0
  const hasFilters = filterStatus !== 'all' || filterPriority !== 'all'

  return (
    <div className="space-y-4">
      {/* Coverage summary */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: '#E8EAF0' }}>
            Coverage — <span style={{ color: pct >= 80 ? '#3ECF8E' : pct >= 40 ? '#FBBF24' : '#E5534B' }}>{pct}%</span>
          </span>
          <span className="text-xs" style={{ color: '#6B7280' }}>
            {coverage?.covered ?? 0} / {coverage?.total ?? tasks.length} tasks covered
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#0F1117' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? '#3ECF8E' : pct >= 40 ? '#FBBF24' : '#E5534B' }}
          />
        </div>
        <div className="flex flex-wrap gap-4 mt-2.5">
          {[
            { label: 'Auto completed', value: coverage?.auto ?? 0, color: '#3ECF8E' },
            { label: 'Validated',      value: coverage?.manual ?? 0, color: '#60A5FA' },
            { label: 'Blocked',        value: coverage?.blocked ?? 0, color: '#E5534B' },
            { label: 'Remaining',      value: coverage?.remaining ?? 0, color: '#6B7280' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="text-sm font-semibold" style={{ color: s.color }}>{s.value}</span>
              <span className="text-xs" style={{ color: '#6B7280' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs outline-none"
          style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A', color: '#E8EAF0' }}
        >
          <option value="all">All Statuses</option>
          <option value="ready">Ready</option>
          <option value="completed">Done</option>
          <option value="blocked">Blocked</option>
          <option value="skipped">Skipped</option>
          <option value="failed">Failed</option>
          <option value="needs_manual_validation">Review</option>
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs outline-none"
          style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A', color: '#E8EAF0' }}
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <span className="text-xs ml-auto" style={{ color: '#6B7280' }}>
          {filtered.length} of {tasks.length} tasks
        </span>
      </div>

      {/* Domain-grouped task sections (when no filter active) */}
      {!hasFilters ? (
        <div className="space-y-3">
          {domainKeys.map(domainId => (
            <DomainSection
              key={domainId}
              domainId={domainId}
              tasks={byDomain[domainId]}
              assessmentId={assessmentId}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      ) : (
        /* Flat table when filters are active */
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
          <div
            className="grid px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{
              gridTemplateColumns: '32px 1fr 90px 80px 60px 80px 110px 100px',
              borderBottom: '1px solid #2A2D3A', color: '#6B7280',
            }}
          >
            <div /><div>Task</div><div>Status</div><div>Priority</div>
            <div>Mode</div><div>Findings</div><div>Last Run</div><div />
          </div>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: '#6B7280' }}>
              No tasks match the current filters.
            </div>
          ) : (
            filtered.map(task => (
              <TaskRow key={task.id} task={task} assessmentId={assessmentId} onRefresh={onRefresh} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AssessmentDetail() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const { addToast } = useToast()

  const [assessment, setAssessment] = useState(null)
  const [findings,   setFindings]   = useState([])
  const [runs,       setRuns]       = useState([])
  const [tasks,      setTasks]      = useState([])
  const [coverage,   setCoverage]   = useState(null)
  const [domains,    setDomains]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [activeTab,  setActiveTab]  = useState('checklist')
  const [showDelete, setShowDelete] = useState(false)

  const load = useCallback(async () => {
    try {
      const [aRes, fRes, rRes, tRes, cRes, dRes] = await Promise.all([
        fetch(`${API}/assessments/${id}`),
        fetch(`${API}/findings?assessment_id=${id}`),
        fetch(`${API}/assessments/${id}/runs`),
        fetch(`${API}/assessments/${id}/tasks`),
        fetch(`${API}/assessments/${id}/coverage`),
        fetch(`${API}/domains`),
      ])
      if (!aRes.ok) throw new Error(aRes.status === 404 ? 'not_found' : `HTTP ${aRes.status}`)
      setAssessment(await aRes.json())
      setFindings(fRes.ok  ? await fRes.json() : [])
      setRuns(rRes.ok      ? await rRes.json() : [])
      setTasks(tRes.ok     ? await tRes.json() : [])
      setCoverage(cRes.ok  ? await cRes.json() : null)
      setDomains(dRes.ok   ? await dRes.json() : [])
    } catch (err) {
      if (err.message === 'not_found') setAssessment(null)
      else addToast(`Failed to load assessment: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [id, addToast])

  useEffect(() => { load() }, [load])

  const handleDelete = async () => {
    try {
      const res = await fetch(`${API}/assessments/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      addToast(`"${assessment.name}" deleted`, 'success')
      navigate('/assessments')
    } catch (err) {
      addToast(`Failed to delete: ${err.message}`, 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p style={{ color: '#6B7280' }}>Loading…</p>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p style={{ color: '#6B7280' }}>Assessment not found.</p>
        <button onClick={() => navigate('/assessments')} className="flex items-center gap-2 text-sm" style={{ color: '#4F8EF7' }}>
          <ArrowLeft size={16} /> Back to Assessments
        </button>
      </div>
    )
  }

  const tabs = [
    { id: 'checklist', label: tasks.length > 0 ? `Checklist (${tasks.length})` : 'Checklist' },
    { id: 'findings',  label: `Findings (${findings.length})` },
    { id: 'runs',      label: `Runs (${runs.length})` },
    { id: 'report',    label: 'Report' },
    { id: 'strategy',  label: 'Strategy' },
  ]

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate('/assessments')}
        className="flex items-center gap-2 text-sm hover:text-white transition-colors"
        style={{ color: '#6B7280' }}
      >
        <ArrowLeft size={15} /> Back to Assessments
      </button>

      {/* Header card */}
      <div className="rounded-xl p-6" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: '#E8EAF0' }}>{assessment.name}</h1>
              <StatusBadge status={assessment.status} />
            </div>
            {assessment.description && (
              <p className="text-sm mt-1.5" style={{ color: '#6B7280' }}>{assessment.description}</p>
            )}
            <div className="flex flex-wrap gap-6 mt-4">
              <div>
                <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#6B7280' }}>Target</p>
                <p className="text-sm font-mono" style={{ color: '#E8EAF0' }}>{assessment.target || 'localhost'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#6B7280' }}>Created</p>
                <p className="text-sm" style={{ color: '#E8EAF0' }}>{formatDate(assessment.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#6B7280' }}>Last Run</p>
                <p className="text-sm" style={{ color: '#E8EAF0' }}>{formatDate(assessment.lastRun)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#6B7280' }}>Findings</p>
                <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>
                  {assessment.findingCount}
                  {assessment.criticalCount > 0 && (
                    <span className="ml-2 text-xs" style={{ color: '#E5534B' }}>
                      {assessment.criticalCount} critical
                    </span>
                  )}
                </p>
              </div>
              {coverage && coverage.total > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#6B7280' }}>Coverage</p>
                  <p className="text-sm font-medium" style={{ color: coverage.pct >= 80 ? '#3ECF8E' : coverage.pct >= 40 ? '#FBBF24' : '#6B7280' }}>
                    {coverage.pct}%
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => addToast('Go to Reports to generate a report for this assessment.', 'info')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium hover:bg-white/5"
              style={{ border: '1px solid #2A2D3A', color: '#E8EAF0' }}
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
              style={{ backgroundColor: 'rgba(229,83,75,0.12)', border: '1px solid rgba(229,83,75,0.2)', color: '#E5534B' }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Run panel */}
      <RunAllPanel assessment={assessment} domains={domains} onRunComplete={load} />

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: activeTab === tab.id ? '#2A2D3A' : 'transparent',
              color: activeTab === tab.id ? '#E8EAF0' : '#6B7280',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Checklist tab */}
      {activeTab === 'checklist' && (
        <ChecklistTab
          tasks={tasks}
          coverage={coverage}
          assessmentId={parseInt(id)}
          assessment={assessment}
          onRefresh={load}
        />
      )}

      {/* Runs tab */}
      {activeTab === 'runs' && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
          <div
            className="grid px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ gridTemplateColumns: '1fr 110px 110px 130px', borderBottom: '1px solid #2A2D3A', color: '#6B7280' }}
          >
            <div>Date</div>
            <div>Status</div>
            <div>Duration</div>
            <div>Findings</div>
          </div>
          {runs.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: '#6B7280' }}>
              No runs yet. Select a playbook above and click <strong>Run Now</strong>.
            </div>
          ) : (
            runs.map(run => (
              <div
                key={run.id}
                className="grid px-4 py-3.5 items-center table-row-hover"
                style={{ gridTemplateColumns: '1fr 110px 110px 130px', borderBottom: '1px solid #2A2D3A' }}
              >
                <div className="text-sm" style={{ color: '#E8EAF0' }}>{formatDate(run.date)}</div>
                <div><RunStatusBadge status={run.status} /></div>
                <div className="text-sm" style={{ color: '#6B7280' }}>{run.duration}</div>
                <div className="text-sm" style={{ color: '#6B7280' }}>
                  {run.status === 'failed' ? '—' : `${run.findingCount} finding${run.findingCount !== 1 ? 's' : ''}`}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Findings tab */}
      {activeTab === 'findings' && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
          <div
            className="grid px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ gridTemplateColumns: '100px 1fr 120px 100px 110px', borderBottom: '1px solid #2A2D3A', color: '#6B7280' }}
          >
            <div>Severity</div>
            <div>Title</div>
            <div>Category</div>
            <div>Status</div>
            <div>Date Found</div>
          </div>
          {findings.length === 0 ? (
            <div className="py-12 text-center text-sm" style={{ color: '#6B7280' }}>
              No findings yet. Run an assessment to populate this list.
            </div>
          ) : (
            findings.map(f => (
              <div
                key={f.id}
                className="grid px-4 py-3.5 items-center table-row-hover cursor-pointer"
                style={{ gridTemplateColumns: '100px 1fr 120px 100px 110px', borderBottom: '1px solid #2A2D3A' }}
                onClick={() => navigate(`/findings?id=${f.id}`)}
              >
                <div><SeverityBadge severity={f.severity} /></div>
                <div>
                  <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{f.title}</p>
                </div>
                <div className="text-sm" style={{ color: '#6B7280' }}>{f.category}</div>
                <div><FindingStatusBadge status={f.status} /></div>
                <div className="text-sm" style={{ color: '#6B7280' }}>{formatDateShort(f.dateFound)}</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Report tab */}
      {activeTab === 'report' && (
        <ReportTab assessment={assessment} reportType="report" addToast={addToast} />
      )}

      {/* Strategy tab */}
      {activeTab === 'strategy' && (
        <ReportTab assessment={assessment} reportType="strategy" addToast={addToast} />
      )}

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title={`Delete "${assessment.name}"?`}
        description="This will permanently delete the assessment, all runs, and all findings."
        items={[
          `Assessment: ${assessment.name}`,
          `${runs.length} run${runs.length !== 1 ? 's' : ''}`,
          `${assessment.findingCount} finding${assessment.findingCount !== 1 ? 's' : ''}`,
        ]}
        requireTyping={assessment.findingCount > 0}
        confirmName={assessment.name}
        confirmLabel="Delete Assessment"
      />
    </div>
  )
}
