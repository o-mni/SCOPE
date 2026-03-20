import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X, ChevronDown, Terminal, BookOpen, AlertTriangle } from 'lucide-react'
import { SeverityBadge, FindingStatusBadge } from '../components/shared/Badge'
import { useToast } from '../App'
import { findings as allFindings } from '../data/mockData'

function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function SidePanel({ finding, onClose, techMode, setTechMode }) {
  if (!finding) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col animate-slide-in-right"
        style={{
          width: '480px',
          maxWidth: '100vw',
          backgroundColor: '#1A1D27',
          borderLeft: '1px solid #2A2D3A',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-6 py-5 flex-shrink-0"
          style={{ borderBottom: '1px solid #2A2D3A' }}
        >
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <SeverityBadge severity={finding.severity} />
              <FindingStatusBadge status={finding.status} />
            </div>
            <h2 className="text-base font-semibold leading-snug" style={{ color: '#E8EAF0' }}>
              {finding.title}
            </h2>
            <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
              {finding.assessmentName} · {finding.category}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/5 flex-shrink-0"
            style={{ color: '#6B7280' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Display mode toggle */}
        <div className="px-6 pt-5 pb-0 flex-shrink-0">
          <div
            className="flex items-center gap-1 p-1 rounded-lg w-fit"
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
              onClick={() => setTechMode(true)}
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
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-5 space-y-6 overflow-y-auto">
          {/* Description */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B7280' }}>
              Description
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: '#E8EAF0' }}>
              {finding.description}
            </p>
          </section>

          {/* Evidence */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B7280' }}>
              Evidence
            </h3>
            <pre
              className="text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap"
              style={{
                backgroundColor: '#0F1117',
                border: '1px solid #2A2D3A',
                color: '#3ECF8E',
                fontFamily: 'monospace',
                lineHeight: '1.6',
              }}
            >
              {finding.evidence}
            </pre>
          </section>

          {/* Remediation */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B7280' }}>
              Remediation {techMode ? '(Technical)' : '(Simple)'}
            </h3>
            {techMode ? (
              <pre
                className="text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap"
                style={{
                  backgroundColor: '#0F1117',
                  border: '1px solid #2A2D3A',
                  color: '#E8EAF0',
                  fontFamily: 'monospace',
                  lineHeight: '1.8',
                }}
              >
                {finding.remediationTechnical}
              </pre>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: '#E8EAF0' }}>
                {finding.remediationSimple}
              </p>
            )}
          </section>

          {/* Metadata */}
          <section
            className="rounded-lg p-4 space-y-2.5"
            style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A' }}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: '#6B7280' }}>Assessment</span>
              <span className="text-xs font-medium" style={{ color: '#E8EAF0' }}>{finding.assessmentName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: '#6B7280' }}>Category</span>
              <span className="text-xs font-medium" style={{ color: '#E8EAF0' }}>{finding.category}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: '#6B7280' }}>Date Found</span>
              <span className="text-xs font-medium" style={{ color: '#E8EAF0' }}>{formatDate(finding.dateFound)}</span>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

export default function Findings() {
  const [searchParams] = useSearchParams()
  const { addToast } = useToast()
  const [filters, setFilters] = useState({
    severity: 'all',
    status: 'all',
    category: 'all',
  })
  const [selected, setSelectedFinding] = useState(null)
  const [techMode, setTechMode] = useState(false)

  // Open from URL param (/findings?id=X)
  useEffect(() => {
    const idParam = searchParams.get('id')
    if (idParam) {
      const f = allFindings.find(f => f.id === parseInt(idParam))
      if (f) setSelectedFinding(f)
    }
  }, [searchParams])

  const categories = [...new Set(allFindings.map(f => f.category))].sort()

  const filtered = allFindings.filter(f => {
    const matchSev = filters.severity === 'all' || f.severity === filters.severity
    const matchStat = filters.status === 'all' || f.status === filters.status
    const matchCat = filters.category === 'all' || f.category === filters.category
    return matchSev && matchStat && matchCat
  })

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  const sorted = [...filtered].sort((a, b) =>
    (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
  )

  const setFilter = (key, val) => setFilters(f => ({ ...f, [key]: val }))

  const FilterSelect = ({ label, value, onChange, options }) => (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
    >
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-transparent outline-none text-sm cursor-pointer"
        style={{ color: value === 'all' ? '#6B7280' : '#E8EAF0' }}
      >
        <option value="all">{label}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#E8EAF0' }}>Findings</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
            {sorted.length} finding{sorted.length !== 1 ? 's' : ''}
            {filtered.length !== allFindings.length && ` (filtered from ${allFindings.length})`}
          </p>
        </div>
        {/* Display mode toggle */}
        <div
          className="flex items-center gap-1 p-1 rounded-lg"
          style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
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
            onClick={() => setTechMode(true)}
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
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="All Severities"
          value={filters.severity}
          onChange={v => setFilter('severity', v)}
          options={[
            { value: 'critical', label: 'Critical' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
            { value: 'info', label: 'Info' },
          ]}
        />
        <FilterSelect
          label="All Statuses"
          value={filters.status}
          onChange={v => setFilter('status', v)}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'remediated', label: 'Remediated' },
            { value: 'accepted', label: 'Accepted' },
          ]}
        />
        <FilterSelect
          label="All Categories"
          value={filters.category}
          onChange={v => setFilter('category', v)}
          options={categories.map(c => ({ value: c, label: c }))}
        />
        {(filters.severity !== 'all' || filters.status !== 'all' || filters.category !== 'all') && (
          <button
            onClick={() => setFilters({ severity: 'all', status: 'all', category: 'all' })}
            className="px-3 py-2 rounded-xl text-sm transition-colors hover:bg-white/5"
            style={{ color: '#6B7280', border: '1px solid #2A2D3A' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
      >
        {/* Header row */}
        <div
          className="grid px-4 py-3 text-xs font-semibold uppercase tracking-wider"
          style={{
            gridTemplateColumns: '100px 1fr 160px 100px 120px 120px',
            borderBottom: '1px solid #2A2D3A',
            color: '#6B7280',
          }}
        >
          <div>Severity</div>
          <div>Title</div>
          <div>Assessment</div>
          <div>Category</div>
          <div>Status</div>
          <div>Date Found</div>
        </div>

        {sorted.length === 0 ? (
          <div className="py-16 text-center">
            <AlertTriangle size={32} style={{ color: '#2A2D3A', margin: '0 auto 12px' }} />
            <p style={{ color: '#6B7280' }}>No findings match the current filters</p>
          </div>
        ) : (
          sorted.map(f => (
            <div
              key={f.id}
              className="grid px-4 py-3.5 items-center table-row-hover cursor-pointer transition-colors"
              style={{
                gridTemplateColumns: '100px 1fr 160px 100px 120px 120px',
                borderBottom: '1px solid #2A2D3A',
                backgroundColor: selected?.id === f.id ? 'rgba(79,142,247,0.05)' : undefined,
              }}
              onClick={() => setSelectedFinding(f)}
            >
              <div><SeverityBadge severity={f.severity} /></div>
              <div>
                <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{f.title}</p>
              </div>
              <div className="text-xs truncate" style={{ color: '#6B7280' }}>{f.assessmentName}</div>
              <div className="text-sm" style={{ color: '#6B7280' }}>{f.category}</div>
              <div><FindingStatusBadge status={f.status} /></div>
              <div className="text-sm" style={{ color: '#6B7280' }}>{formatDate(f.dateFound)}</div>
            </div>
          ))
        )}
      </div>

      {/* Side panel */}
      <SidePanel
        finding={selected}
        onClose={() => setSelectedFinding(null)}
        techMode={techMode}
        setTechMode={setTechMode}
      />
    </div>
  )
}
