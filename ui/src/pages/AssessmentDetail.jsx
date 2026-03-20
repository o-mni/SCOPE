import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Play, Square, Edit2, Download, Trash2, ChevronRight,
  ChevronDown, RotateCcw,
} from 'lucide-react'
import {
  StatusBadge, SeverityBadge, FindingStatusBadge, RunStatusBadge,
} from '../components/shared/Badge'
import ConfirmModal from '../components/shared/ConfirmModal'
import { useToast } from '../App'

const API = 'http://localhost:8000/api'

const PLAYBOOKS = [
  { value: 'linux-baseline',   label: 'Linux Baseline (all 11 modules)' },
  { value: 'ssh-hardening',    label: 'SSH Hardening (3 modules)' },
  { value: 'network-exposure', label: 'Network Exposure (2 modules)' },
  { value: 'user-accounts',    label: 'User Accounts (2 modules)' },
  { value: 'file-permissions', label: 'File Permissions (2 modules)' },
]

// Colour each SSE event type in the run console
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

// ── Run console ───────────────────────────────────────────────────────────────

function RunConsole({ assessmentId, onRunComplete }) {
  const [playbook, setPlaybook]   = useState('linux-baseline')
  const [running, setRunning]     = useState(false)
  const [lines, setLines]         = useState([])
  const [expanded, setExpanded]   = useState(false)
  const esRef                     = useRef(null)
  const bottomRef                 = useRef(null)

  const appendLine = (type, message) => {
    setLines(prev => [...prev, { type, message, id: Date.now() + Math.random() }])
  }

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const startRun = useCallback(async () => {
    if (running) return
    setRunning(true)
    setLines([])
    setExpanded(true)

    try {
      const res = await fetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'run_playbook',
          playbook,
          assessmentId,
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
            es.close()
            esRef.current = null
            setRunning(false)
            onRunComplete()
            return
          }
          if (data.type === 'divider') {
            appendLine('divider', '──────────────────────────────')
            return
          }
          appendLine(data.type, data.message || '')
        } catch (_) {}
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        setRunning(false)
        appendLine('error', 'Connection to server lost.')
      }
    } catch (err) {
      appendLine('error', `Failed to start task: ${err.message}`)
      setRunning(false)
    }
  }, [running, playbook, assessmentId, onRunComplete])

  const stopRun = () => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    setRunning(false)
    appendLine('info', '  Run cancelled by user.')
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
    >
      {/* Controls bar */}
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3"
        style={{ borderBottom: expanded ? '1px solid #2A2D3A' : 'none' }}
      >
        <select
          value={playbook}
          onChange={e => setPlaybook(e.target.value)}
          disabled={running}
          className="px-3 py-1.5 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: '#0F1117',
            border: '1px solid #2A2D3A',
            color: '#E8EAF0',
            opacity: running ? 0.5 : 1,
          }}
        >
          {PLAYBOOKS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

        {!running ? (
          <button
            onClick={startRun}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: '#3ECF8E', color: '#fff' }}
          >
            <Play size={13} />
            Run Now
          </button>
        ) : (
          <button
            onClick={stopRun}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'rgba(229,83,75,0.15)', border: '1px solid rgba(229,83,75,0.3)', color: '#FCA5A5' }}
          >
            <Square size={13} />
            Stop
          </button>
        )}

        {lines.length > 0 && !running && (
          <button
            onClick={() => { setLines([]); setExpanded(false) }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
            style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
          >
            <RotateCcw size={11} />
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {running && (
            <span style={{ fontSize: '0.75rem', color: '#FBBF24' }}>● Running…</span>
          )}
          {lines.length > 0 && (
            <button onClick={() => setExpanded(v => !v)} style={{ color: '#6B7280' }}>
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Log output */}
      {expanded && lines.length > 0 && (
        <div
          style={{
            height: '320px',
            overflowY: 'auto',
            padding: '0.75rem 1rem',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '0.75rem',
            lineHeight: 1.7,
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
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssessmentDetail() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const { addToast } = useToast()

  const [assessment, setAssessment] = useState(null)
  const [findings,   setFindings]   = useState([])
  const [runs,       setRuns]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [activeTab,  setActiveTab]  = useState('runs')
  const [showDelete, setShowDelete] = useState(false)

  const load = useCallback(async () => {
    try {
      const [aRes, fRes, rRes] = await Promise.all([
        fetch(`${API}/assessments/${id}`),
        fetch(`${API}/findings?assessment_id=${id}`),
        fetch(`${API}/assessments/${id}/runs`),
      ])
      if (!aRes.ok) throw new Error(aRes.status === 404 ? 'not_found' : `HTTP ${aRes.status}`)
      setAssessment(await aRes.json())
      setFindings(fRes.ok ? await fRes.json() : [])
      setRuns(rRes.ok ? await rRes.json() : [])
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

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate('/assessments')}
        className="flex items-center gap-2 text-sm hover:text-white transition-colors"
        style={{ color: '#6B7280' }}
      >
        <ArrowLeft size={15} />
        Back to Assessments
      </button>

      {/* Assessment header card */}
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
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => addToast('Export: go to Reports page to generate a report', 'info')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium hover:bg-white/5"
              style={{ border: '1px solid #2A2D3A', color: '#E8EAF0' }}
            >
              <Download size={14} />
              Export
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
              style={{ backgroundColor: 'rgba(229,83,75,0.12)', border: '1px solid rgba(229,83,75,0.2)', color: '#E5534B' }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Run console */}
      <RunConsole assessmentId={parseInt(id)} onRunComplete={load} />

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
        {[
          { id: 'runs',     label: `Runs (${runs.length})` },
          { id: 'findings', label: `Findings (${findings.length})` },
        ].map(tab => (
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
            <div className="py-12 text-center" style={{ color: '#6B7280' }}>
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
            <div className="py-12 text-center" style={{ color: '#6B7280' }}>
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
