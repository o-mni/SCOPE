import React, { useState, useEffect } from 'react'
import { Terminal, BookOpen, Folder, Shield, Moon, Trash2, AlertTriangle, FileText, RefreshCw, ExternalLink, Copy, X, Map } from 'lucide-react'
import ConfirmModal from '../components/shared/ConfirmModal'
import { useToast } from '../App'

const API = 'http://localhost:8000/api'

function SettingsSection({ title, description, children }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
    >
      <div className="px-6 py-4" style={{ borderBottom: '1px solid #2A2D3A' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>{title}</h2>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{description}</p>
        )}
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function SettingsRow({ label, description, children }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #2A2D3A' }}>
      <div className="flex-1 pr-6">
        <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{label}</p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ── Templates section ─────────────────────────────────────────────────────────

function TemplatesSection({ addToast }) {
  const [data,        setData]        = useState({ templates: [], errors: {} })
  const [loading,     setLoading]     = useState(true)
  const [reloading,    setReloading]    = useState(false)
  const [dupTarget,    setDupTarget]    = useState(null)
  const [dupId,        setDupId]        = useState('')
  const [dupName,      setDupName]      = useState('')
  const [dupLoading,   setDupLoading]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [uploading,    setUploading]    = useState(false)
  const [dragOver,     setDragOver]     = useState(false)
  const fileInputRef = React.useRef(null)

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API}/templates`)
      if (res.ok) setData(await res.json())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchTemplates() }, [])

  const handleReload = async () => {
    setReloading(true)
    try {
      const res = await fetch(`${API}/templates/reload`, { method: 'POST' })
      const result = res.ok ? await res.json() : null
      if (result) {
        addToast(`Templates reloaded — ${result.loaded} loaded`, 'success')
        await fetchTemplates()
      }
    } catch (e) {
      addToast('Reload failed', 'error')
    } finally {
      setReloading(false)
    }
  }

  const handleOpenFolder = async (id) => {
    try {
      await fetch(`${API}/templates/${id}/open-folder`, { method: 'POST' })
    } catch {}
  }

  const handleDuplicate = async () => {
    if (!dupId || !dupName) return
    setDupLoading(true)
    try {
      const res = await fetch(`${API}/templates/${dupTarget.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_id: dupId, new_name: dupName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      addToast(`Template "${dupName}" created`, 'success')
      setDupTarget(null)
      setDupId('')
      setDupName('')
      await fetchTemplates()
    } catch (e) {
      addToast(`Duplicate failed: ${e.message}`, 'error')
    } finally {
      setDupLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`${API}/templates/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      addToast(`Template "${deleteTarget.name}" deleted`, 'success')
      setDeleteTarget(null)
      await fetchTemplates()
    } catch (e) {
      addToast(`Delete failed: ${e.message}`, 'error')
    }
  }

  const handleUpload = async (file) => {
    if (!file || !file.name.endsWith('.zip')) {
      addToast('Please select a .zip template archive', 'error')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API}/templates/upload`, { method: 'POST', body: fd })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.detail || `HTTP ${res.status}`)
      addToast(`Template "${result.name}" installed`, 'success')
      await fetchTemplates()
    } catch (e) {
      addToast(`Upload failed: ${e.message}`, 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const typeIcon = (t) => t.templateType === 'strategy' ? Map : FileText
  const typeLabel = (t) => {
    if (t.templateType === 'both') return 'Report + Strategy'
    if (t.templateType === 'strategy') return 'Strategy'
    return 'Report'
  }

  return (
    <>
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #2A2D3A' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>Templates</h2>
            <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
              Manage report and strategy plan templates stored in{' '}
              <code className="text-xs px-1 rounded" style={{ backgroundColor: '#0F1117', color: '#3ECF8E' }}>report_templates/</code>
            </p>
          </div>
          <button
            onClick={handleReload}
            disabled={reloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
            title="Rescan templates directory"
          >
            <RefreshCw size={12} className={reloading ? 'animate-spin' : ''} />
            Reload
          </button>
        </div>

        {/* Template list */}
        <div className="divide-y" style={{ borderColor: '#2A2D3A' }}>
          {loading ? (
            <div className="py-8 text-center text-sm" style={{ color: '#6B7280' }}>Loading templates…</div>
          ) : data.templates.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: '#6B7280' }}>No templates found in report_templates/</div>
          ) : data.templates.map(t => {
            const TypeIcon = typeIcon(t)
            return (
              <div key={t.id} className="px-6 py-4 flex items-start gap-4">
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.15)' }}
                >
                  <TypeIcon size={16} style={{ color: '#4F8EF7' }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>{t.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: '#0F1117', color: '#6B7280', border: '1px solid #2A2D3A' }}>
                      v{t.version}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(100,116,139,0.1)', color: '#64748B', border: '1px solid rgba(100,116,139,0.2)' }}>
                      {typeLabel(t)}
                    </span>
                    {t.builtin && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(62,207,142,0.08)', color: '#3ECF8E', border: '1px solid rgba(62,207,142,0.2)' }}>
                        built-in
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: '#6B7280' }}>
                      {t.description.length > 140 ? t.description.slice(0, 140) + '…' : t.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    {/* Preview */}
                    {(t.templateType === 'report' || t.templateType === 'both') && (
                      <button
                        onClick={() => window.open(`${API}/templates/${t.id}/preview/report`, '_blank')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors hover:bg-white/5"
                        style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
                      >
                        <ExternalLink size={11} /> Preview report
                      </button>
                    )}
                    {(t.templateType === 'strategy' || t.templateType === 'both') && (
                      <button
                        onClick={() => window.open(`${API}/templates/${t.id}/preview/strategy`, '_blank')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors hover:bg-white/5"
                        style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
                      >
                        <ExternalLink size={11} /> Preview strategy
                      </button>
                    )}
                    {/* Open folder */}
                    <button
                      onClick={() => handleOpenFolder(t.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors hover:bg-white/5"
                      style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
                    >
                      <Folder size={11} /> Open folder
                    </button>
                    {/* Duplicate */}
                    <button
                      onClick={() => {
                        setDupTarget(t)
                        setDupId('')
                        setDupName(`${t.name} (copy)`)
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors hover:bg-white/5"
                      style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
                    >
                      <Copy size={11} /> Duplicate
                    </button>
                    {/* Delete — custom templates only */}
                    {!t.builtin && (
                      <button
                        onClick={() => setDeleteTarget(t)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors"
                        style={{ color: '#E5534B', border: '1px solid rgba(229,83,75,0.25)' }}
                      >
                        <X size={11} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Load errors */}
        {Object.keys(data.errors || {}).length > 0 && (
          <div className="px-6 py-4" style={{ borderTop: '1px solid #2A2D3A', backgroundColor: 'rgba(229,83,75,0.04)' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#E5534B' }}>Template load errors</p>
            {Object.entries(data.errors).map(([folder, msg]) => (
              <div key={folder} className="text-xs mb-1" style={{ color: '#6B7280' }}>
                <code style={{ color: '#E5534B' }}>{folder}</code>: {msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add Template ─────────────────────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
      >
        <div className="px-6 py-4" style={{ borderBottom: '1px solid #2A2D3A' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>Add Template</h2>
          <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
            Upload a <code className="text-xs px-1 rounded" style={{ backgroundColor: '#0F1117', color: '#3ECF8E' }}>.zip</code> archive
            containing a valid template folder, or duplicate an existing template to customise it.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) handleUpload(f)
            }}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 p-8 rounded-xl cursor-pointer transition-colors"
            style={{
              border: `2px dashed ${dragOver ? '#4F8EF7' : '#2A2D3A'}`,
              backgroundColor: dragOver ? 'rgba(79,142,247,0.04)' : 'transparent',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={e => { if (e.target.files[0]) handleUpload(e.target.files[0]) }}
            />
            {uploading ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#4F8EF7' }}>
                <RefreshCw size={16} className="animate-spin" />
                Installing template…
              </div>
            ) : (
              <>
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-lg"
                  style={{ backgroundColor: 'rgba(79,142,247,0.08)', border: '1px solid rgba(79,142,247,0.15)' }}
                >
                  <FileText size={18} style={{ color: '#4F8EF7' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>
                  Drop a .zip template here
                </p>
                <p className="text-xs" style={{ color: '#6B7280' }}>
                  or click to browse — max 10 MB
                </p>
              </>
            )}
          </div>

          {/* ZIP structure hint */}
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A' }}
          >
            <p className="text-xs font-semibold mb-2" style={{ color: '#6B7280' }}>Expected ZIP structure</p>
            <pre className="text-xs leading-relaxed" style={{ color: '#4F8EF7', fontFamily: 'monospace' }}>{`my-template/
  template.yml
  report.html.j2      ← for report templates
  strategy.html.j2    ← for strategy templates
  assets/
    styles.css`}</pre>
          </div>
        </div>
      </div>

      {/* Duplicate modal */}
      {dupTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-xl p-6 space-y-4" style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}>
            <h3 className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>Duplicate "{dupTarget.name}"</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: '#6B7280' }}>Template ID (folder name)</label>
                <input
                  type="text"
                  value={dupId}
                  onChange={e => setDupId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-'))}
                  placeholder="my-custom-template"
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A', color: '#E8EAF0' }}
                />
                <p className="text-xs mt-1" style={{ color: '#6B7280' }}>Lowercase letters, digits, and hyphens only</p>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: '#6B7280' }}>Display Name</label>
                <input
                  type="text"
                  value={dupName}
                  onChange={e => setDupName(e.target.value)}
                  placeholder="My Custom Template"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A', color: '#E8EAF0' }}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleDuplicate}
                disabled={!dupId || !dupName || dupLoading}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                style={{ backgroundColor: '#4F8EF7', color: '#fff' }}
              >
                {dupLoading ? 'Creating…' : 'Create copy'}
              </button>
              <button
                onClick={() => setDupTarget(null)}
                className="px-4 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
                style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This will permanently delete the template folder and all its files."
        items={deleteTarget ? [`Template: ${deleteTarget.name}`, `Folder: report_templates/${deleteTarget.id}/`] : []}
        requireTyping={false}
        confirmLabel="Delete Template"
      />
    </>
  )
}

// ── Main Settings page ────────────────────────────────────────────────────────

export default function Settings() {
  const { addToast } = useToast()
  const [techMode, setTechMode] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const storagePath = '/Users/username/.scope/data'

  const handleClearData = () => {
    setShowClearConfirm(false)
    addToast('All data cleared. SCOPE has been reset.', 'success')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: '#E8EAF0' }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
          Configure your SCOPE instance
        </p>
      </div>

      {/* Display */}
      <SettingsSection
        title="Display"
        description="Control how findings and information are presented"
      >
        <SettingsRow
          label="Display Mode"
          description="Simple mode shows plain language. Technical mode shows commands and code."
        >
          <div
            className="flex items-center gap-1 p-1 rounded-lg"
            style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A' }}
          >
            <button
              onClick={() => setTechMode(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: !techMode ? '#2A2D3A' : 'transparent',
                color: !techMode ? '#E8EAF0' : '#6B7280',
              }}
            >
              <BookOpen size={12} />
              Simple
            </button>
            <button
              onClick={() => {
                setTechMode(true)
                addToast('Technical mode enabled', 'info')
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: techMode ? '#2A2D3A' : 'transparent',
                color: techMode ? '#E8EAF0' : '#6B7280',
              }}
            >
              <Terminal size={12} />
              Technical
            </button>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Theme"
          description="SCOPE uses a dark theme optimized for security work."
        >
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: 'rgba(79,142,247,0.1)',
              border: '1px solid rgba(79,142,247,0.2)',
              color: '#4F8EF7',
            }}
          >
            <Moon size={12} />
            Dark (default)
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* Storage */}
      <SettingsSection
        title="Storage"
        description="Where SCOPE stores its local data"
      >
        <div>
          <SettingsRow
            label="Data Directory"
            description="SQLite database and report files are stored here."
          >
            <div className="flex items-center gap-2">
              <code
                className="text-xs px-2 py-1 rounded font-mono"
                style={{
                  backgroundColor: '#0F1117',
                  border: '1px solid #2A2D3A',
                  color: '#3ECF8E',
                }}
              >
                {storagePath}
              </code>
              <button
                onClick={() => addToast('Opened file browser', 'info')}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/5"
                style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
                title="Open in file browser"
              >
                <Folder size={12} />
              </button>
            </div>
          </SettingsRow>
          <div className="pt-3 last:pb-0" />
        </div>
      </SettingsSection>

      {/* About */}
      <SettingsSection title="About">
        <div className="space-y-0">
          <SettingsRow label="Version">
            <span className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: '#0F1117', color: '#4F8EF7', border: '1px solid #2A2D3A' }}>
              v1.0.0
            </span>
          </SettingsRow>
          <SettingsRow label="Instance">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: 'rgba(62, 207, 142, 0.1)',
                border: '1px solid rgba(62, 207, 142, 0.25)',
                color: '#3ECF8E',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#3ECF8E' }} />
              Local
            </div>
          </SettingsRow>
          <SettingsRow label="License">
            <span className="text-sm" style={{ color: '#6B7280' }}>MIT</span>
          </SettingsRow>
          <SettingsRow label="Backend API">
            <span className="text-xs font-mono" style={{ color: '#6B7280' }}>http://localhost:8000</span>
          </SettingsRow>
        </div>
      </SettingsSection>

      {/* Data management */}
      <SettingsSection
        title="Data Management"
        description="Manage your local SCOPE data"
      >
        <div
          className="flex items-start gap-4 p-4 rounded-xl"
          style={{
            backgroundColor: 'rgba(229,83,75,0.05)',
            border: '1px solid rgba(229,83,75,0.15)',
          }}
        >
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'rgba(229,83,75,0.12)' }}
          >
            <AlertTriangle size={18} style={{ color: '#E5534B' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>Clear All Data</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: '#6B7280' }}>
              Permanently deletes all assessments, findings, runs, and reports from the local database.
              This action cannot be undone.
            </p>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'rgba(229,83,75,0.15)',
                border: '1px solid rgba(229,83,75,0.25)',
                color: '#E5534B',
              }}
            >
              <Trash2 size={14} />
              Clear All Data
            </button>
          </div>
        </div>
      </SettingsSection>

      {/* Templates */}
      <TemplatesSection addToast={addToast} />

      {/* Clear confirm */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearData}
        title="Clear All Data?"
        description="This will permanently erase everything stored in SCOPE. You cannot undo this action."
        items={[
          '5 assessments',
          '37 findings',
          '10 runs',
          '4 reports',
          'All activity history',
        ]}
        requireTyping={false}
        confirmLabel="Clear All Data"
      />
    </div>
  )
}
