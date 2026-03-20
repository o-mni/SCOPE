import React, { useState } from 'react'
import { Plus, FileText, Eye, Download, X } from 'lucide-react'
import { FormatBadge } from '../components/shared/Badge'
import OverflowMenu from '../components/shared/OverflowMenu'
import ConfirmModal from '../components/shared/ConfirmModal'
import { useToast } from '../App'
import { reports as initialReports, assessments } from '../data/mockData'

function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function GenerateModal({ isOpen, onClose, onGenerate }) {
  const [form, setForm] = useState({
    assessmentId: '',
    format: 'PDF',
    scope: 'all',
    includeEvidence: true,
    includeRemediation: true,
  })

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.assessmentId) return
    onGenerate(form)
    setForm({ assessmentId: '', format: 'PDF', scope: 'all', includeEvidence: true, includeRemediation: true })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl mx-4 animate-fade-in"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #2A2D3A' }}>
          <h2 className="text-base font-semibold" style={{ color: '#E8EAF0' }}>Generate Report</h2>
          <button onClick={onClose} style={{ color: '#6B7280' }}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#6B7280' }}>
                Assessment <span style={{ color: '#E5534B' }}>*</span>
              </label>
              <select
                value={form.assessmentId}
                onChange={e => setForm(f => ({ ...f, assessmentId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  backgroundColor: '#0F1117',
                  border: '1px solid #2A2D3A',
                  color: form.assessmentId ? '#E8EAF0' : '#6B7280',
                }}
              >
                <option value="">Select an assessment...</option>
                {assessments.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#6B7280' }}>Format</label>
              <div className="flex gap-2 flex-wrap">
                {['PDF', 'HTML', 'Markdown', 'JSON'].map(fmt => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, format: fmt }))}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: form.format === fmt ? '#4F8EF7' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${form.format === fmt ? '#4F8EF7' : '#2A2D3A'}`,
                      color: form.format === fmt ? '#fff' : '#6B7280',
                    }}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#6B7280' }}>Scope</label>
              <select
                value={form.scope}
                onChange={e => setForm(f => ({ ...f, scope: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  backgroundColor: '#0F1117',
                  border: '1px solid #2A2D3A',
                  color: '#E8EAF0',
                }}
              >
                <option value="all">All findings</option>
                <option value="open">Open findings only</option>
                <option value="critical">Critical & High only</option>
                <option value="remediated">Remediated findings</option>
              </select>
            </div>
            <div className="space-y-2.5">
              <label className="block text-xs font-medium" style={{ color: '#6B7280' }}>Include</label>
              {[
                { key: 'includeEvidence', label: 'Evidence' },
                { key: 'includeRemediation', label: 'Remediation steps' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="accent-primary w-4 h-4"
                  />
                  <span className="text-sm" style={{ color: '#E8EAF0' }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid #2A2D3A' }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
              style={{ color: '#E8EAF0', border: '1px solid #2A2D3A' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: '#4F8EF7', color: '#fff' }}
            >
              Generate Report
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PreviewPanel({ report, onClose }) {
  if (!report) return null

  const a = assessments.find(a => a.id === report.assessmentId)

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col animate-slide-in-right"
        style={{
          width: '600px',
          maxWidth: '100vw',
          backgroundColor: '#1A1D27',
          borderLeft: '1px solid #2A2D3A',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #2A2D3A' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ backgroundColor: 'rgba(79,142,247,0.12)' }}
            >
              <FileText size={18} style={{ color: '#4F8EF7' }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>{report.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <FormatBadge format={report.format} />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: '#6B7280' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Metadata sidebar */}
          <div
            className="w-48 flex-shrink-0 p-4 space-y-4 overflow-y-auto"
            style={{ borderRight: '1px solid #2A2D3A' }}
          >
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Assessment</p>
              <p className="text-xs font-medium" style={{ color: '#E8EAF0' }}>{report.assessmentName}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Format</p>
              <FormatBadge format={report.format} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Generated</p>
              <p className="text-xs" style={{ color: '#E8EAF0' }}>{formatDate(report.date)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>File Size</p>
              <p className="text-xs font-medium" style={{ color: '#E8EAF0' }}>{report.size}</p>
            </div>
            {a && (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Findings</p>
                  <p className="text-xs font-medium" style={{ color: '#E8EAF0' }}>{a.findingCount}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6B7280' }}>Critical</p>
                  <p className="text-xs font-medium" style={{ color: a.criticalCount > 0 ? '#E5534B' : '#E8EAF0' }}>
                    {a.criticalCount}
                  </p>
                </div>
              </>
            )}
            <button
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: '#4F8EF7', color: '#fff' }}
            >
              <Download size={12} />
              Download
            </button>
          </div>

          {/* Preview area */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div
              className="rounded-xl p-6 h-full flex flex-col gap-4"
              style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A' }}
            >
              {/* Mock report preview */}
              <div style={{ borderBottom: '2px solid #2A2D3A', paddingBottom: '16px' }}>
                <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#4F8EF7' }}>SCOPE Security Report</p>
                <h3 className="text-lg font-bold" style={{ color: '#E8EAF0' }}>{report.assessmentName}</h3>
                <p className="text-xs mt-1" style={{ color: '#6B7280' }}>Generated {formatDate(report.date)}</p>
              </div>
              {a && (
                <div>
                  <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#6B7280' }}>Executive Summary</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#E8EAF0' }}>
                    This report summarizes the findings from the {a.name} assessment conducted against target <span className="font-mono" style={{ color: '#4F8EF7' }}>{a.target}</span>.
                    The assessment identified <strong>{a.findingCount} findings</strong> across multiple severity levels
                    {a.criticalCount > 0 && <>, including <strong style={{ color: '#E5534B' }}>{a.criticalCount} critical</strong> issues requiring immediate attention</>}.
                  </p>
                </div>
              )}
              <div
                className="rounded-lg p-4 flex items-center gap-3"
                style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
              >
                <FileText size={32} style={{ color: '#2A2D3A' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>Full report content</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>Download the {report.format} file to view the complete report</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function Reports() {
  const { addToast } = useToast()
  const [reports, setReports] = useState(initialReports)
  const [showGenerate, setShowGenerate] = useState(false)
  const [previewReport, setPreviewReport] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const handleGenerate = (form) => {
    const assessment = assessments.find(a => a.id === parseInt(form.assessmentId))
    const newReport = {
      id: Date.now(),
      name: `${assessment.name} — ${form.scope === 'all' ? 'Full' : form.scope === 'critical' ? 'Critical' : 'Executive'} Report`,
      assessmentId: assessment.id,
      assessmentName: assessment.name,
      format: form.format,
      date: new Date().toISOString(),
      size: `${Math.round(Math.random() * 900 + 100)} KB`,
    }
    setReports(prev => [newReport, ...prev])
    setShowGenerate(false)
    addToast(`Report generated: ${newReport.name}`, 'success')
  }

  const handleDelete = (report) => {
    setReports(prev => prev.filter(r => r.id !== report.id))
    setDeleteTarget(null)
    addToast(`"${report.name}" deleted`, 'success')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#E8EAF0' }}>Reports</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
            {reports.length} report{reports.length !== 1 ? 's' : ''} generated
          </p>
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:brightness-110"
          style={{ backgroundColor: '#4F8EF7', color: '#fff' }}
        >
          <Plus size={16} />
          Generate Report
        </button>
      </div>

      {/* Reports list */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
      >
        {/* Header */}
        <div
          className="grid px-4 py-3 text-xs font-semibold uppercase tracking-wider"
          style={{
            gridTemplateColumns: '1fr 200px 80px 180px 40px',
            borderBottom: '1px solid #2A2D3A',
            color: '#6B7280',
          }}
        >
          <div>Report Name</div>
          <div>Assessment</div>
          <div>Format</div>
          <div>Generated</div>
          <div />
        </div>

        {reports.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={32} style={{ color: '#2A2D3A', margin: '0 auto 12px' }} />
            <p style={{ color: '#6B7280' }}>No reports yet. Generate your first report.</p>
          </div>
        ) : (
          reports.map(r => (
            <div
              key={r.id}
              className="grid px-4 py-3.5 items-center table-row-hover cursor-pointer transition-colors"
              style={{
                gridTemplateColumns: '1fr 200px 80px 180px 40px',
                borderBottom: '1px solid #2A2D3A',
              }}
              onClick={() => setPreviewReport(r)}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
                  style={{ backgroundColor: 'rgba(79,142,247,0.1)' }}
                >
                  <FileText size={15} style={{ color: '#4F8EF7' }} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{r.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{r.size}</p>
                </div>
              </div>
              <div className="text-sm truncate pr-4" style={{ color: '#6B7280' }}>{r.assessmentName}</div>
              <div><FormatBadge format={r.format} /></div>
              <div className="text-xs" style={{ color: '#6B7280' }}>{formatDate(r.date)}</div>
              <div onClick={e => e.stopPropagation()}>
                <OverflowMenu
                  items={[
                    { label: 'Preview', onClick: () => setPreviewReport(r) },
                    { label: 'Download', onClick: () => addToast('Downloading report...', 'info') },
                    { divider: true },
                    { label: 'Delete', danger: true, onClick: () => setDeleteTarget(r) },
                  ]}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Generate modal */}
      <GenerateModal
        isOpen={showGenerate}
        onClose={() => setShowGenerate(false)}
        onGenerate={handleGenerate}
      />

      {/* Preview panel */}
      {previewReport && (
        <PreviewPanel
          report={previewReport}
          onClose={() => setPreviewReport(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
          title={`Delete "${deleteTarget.name}"?`}
          description="This will permanently delete the report file."
          items={[`Report: ${deleteTarget.name}`, `Format: ${deleteTarget.format}`, `Size: ${deleteTarget.size}`]}
          requireTyping={false}
          confirmLabel="Delete Report"
        />
      )}
    </div>
  )
}
