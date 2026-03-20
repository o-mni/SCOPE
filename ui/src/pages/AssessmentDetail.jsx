import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Edit2, Download, Trash2, ChevronRight } from 'lucide-react'
import { StatusBadge, SeverityBadge, FindingStatusBadge, RunStatusBadge } from '../components/shared/Badge'
import ConfirmModal from '../components/shared/ConfirmModal'
import { useToast } from '../App'
import { assessments, findings, runs } from '../data/mockData'

function formatDate(ts) {
  if (!ts) return 'Never'
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatDateShort(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AssessmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState('runs')
  const [showDelete, setShowDelete] = useState(false)

  const assessment = assessments.find(a => a.id === parseInt(id))

  if (!assessment) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p style={{ color: '#6B7280' }}>Assessment not found.</p>
        <button
          onClick={() => navigate('/assessments')}
          className="flex items-center gap-2 text-sm"
          style={{ color: '#4F8EF7' }}
        >
          <ArrowLeft size={16} /> Back to Assessments
        </button>
      </div>
    )
  }

  const assessmentRuns = runs.filter(r => r.assessmentId === assessment.id)
  const assessmentFindings = findings.filter(f => f.assessmentId === assessment.id)

  const handleDelete = () => {
    setShowDelete(false)
    addToast(`"${assessment.name}" deleted`, 'success')
    navigate('/assessments')
  }

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate('/assessments')}
        className="flex items-center gap-2 text-sm transition-colors hover:text-white"
        style={{ color: '#6B7280' }}
      >
        <ArrowLeft size={15} />
        Back to Assessments
      </button>

      {/* Assessment header card */}
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: '#E8EAF0' }}>{assessment.name}</h1>
              <StatusBadge status={assessment.status} />
            </div>
            <p className="text-sm mt-1.5" style={{ color: '#6B7280' }}>{assessment.description}</p>
            <div className="flex flex-wrap gap-6 mt-4">
              <div>
                <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#6B7280' }}>Target</p>
                <p className="text-sm font-mono" style={{ color: '#E8EAF0' }}>{assessment.target}</p>
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

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => addToast(`Starting run for "${assessment.name}"...`, 'info')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ backgroundColor: '#3ECF8E', color: '#fff' }}
            >
              <Play size={14} />
              Run Now
            </button>
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
              style={{ border: '1px solid #2A2D3A', color: '#E8EAF0' }}
            >
              <Edit2 size={14} />
              Edit
            </button>
            <button
              onClick={() => addToast('Exporting report...', 'info')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
              style={{ border: '1px solid #2A2D3A', color: '#E8EAF0' }}
            >
              <Download size={14} />
              Export
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'rgba(229,83,75,0.12)',
                border: '1px solid rgba(229,83,75,0.2)',
                color: '#E5534B',
              }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl w-fit"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
      >
        {[
          { id: 'runs', label: `Runs (${assessmentRuns.length})` },
          { id: 'findings', label: `Findings (${assessmentFindings.length})` },
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

      {/* Tab content */}
      {activeTab === 'runs' && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
        >
          <div
            className="grid px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{
              gridTemplateColumns: '1fr 100px 100px 120px 80px',
              borderBottom: '1px solid #2A2D3A',
              color: '#6B7280',
            }}
          >
            <div>Date</div>
            <div>Status</div>
            <div>Duration</div>
            <div>Findings</div>
            <div />
          </div>
          {assessmentRuns.length === 0 ? (
            <div className="py-12 text-center">
              <p style={{ color: '#6B7280' }}>No runs yet. Click "Run Now" to start.</p>
            </div>
          ) : (
            assessmentRuns.map(run => (
              <div
                key={run.id}
                className="grid px-4 py-3.5 items-center table-row-hover"
                style={{
                  gridTemplateColumns: '1fr 100px 100px 120px 80px',
                  borderBottom: '1px solid #2A2D3A',
                }}
              >
                <div className="text-sm" style={{ color: '#E8EAF0' }}>{formatDate(run.date)}</div>
                <div><RunStatusBadge status={run.status} /></div>
                <div className="text-sm" style={{ color: '#6B7280' }}>{run.duration}</div>
                <div className="text-sm" style={{ color: '#6B7280' }}>
                  {run.status === 'failed' ? '—' : `${run.findingCount} findings`}
                </div>
                <div className="text-right">
                  <button
                    className="text-xs px-2 py-1 rounded-lg transition-colors hover:bg-white/5"
                    style={{ color: '#4F8EF7' }}
                  >
                    View
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'findings' && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
        >
          <div
            className="grid px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{
              gridTemplateColumns: '100px 1fr 120px 100px 110px',
              borderBottom: '1px solid #2A2D3A',
              color: '#6B7280',
            }}
          >
            <div>Severity</div>
            <div>Title</div>
            <div>Category</div>
            <div>Status</div>
            <div>Date Found</div>
          </div>
          {assessmentFindings.length === 0 ? (
            <div className="py-12 text-center">
              <p style={{ color: '#6B7280' }}>No findings yet.</p>
            </div>
          ) : (
            assessmentFindings.map(f => (
              <div
                key={f.id}
                className="grid px-4 py-3.5 items-center table-row-hover cursor-pointer"
                style={{
                  gridTemplateColumns: '100px 1fr 120px 100px 110px',
                  borderBottom: '1px solid #2A2D3A',
                }}
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
          `${assessmentRuns.length} run${assessmentRuns.length !== 1 ? 's' : ''}`,
          `${assessment.findingCount} finding${assessment.findingCount !== 1 ? 's' : ''}`,
        ]}
        requireTyping={assessment.findingCount > 0}
        confirmName={assessment.name}
        confirmLabel="Delete Assessment"
      />
    </div>
  )
}
