import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, ChevronDown, Trash2 } from 'lucide-react'
import { StatusBadge } from '../components/shared/Badge'
import OverflowMenu from '../components/shared/OverflowMenu'
import ConfirmModal from '../components/shared/ConfirmModal'
import { useToast } from '../App'
import { assessments as initialAssessments } from '../data/mockData'

function formatDate(ts) {
  if (!ts) return 'Never'
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function CreateModal({ isOpen, onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', description: '', target: '' })

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onCreate(form)
    setForm({ name: '', description: '', target: '' })
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
          <h2 className="text-base font-semibold" style={{ color: '#E8EAF0' }}>New Assessment</h2>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#6B7280' }}>
                Assessment Name <span style={{ color: '#E5534B' }}>*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Web Application Audit"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: '#0F1117',
                  border: '1px solid #2A2D3A',
                  color: '#E8EAF0',
                }}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#6B7280' }}>
                Description
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What is this assessment for?"
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors resize-none"
                style={{
                  backgroundColor: '#0F1117',
                  border: '1px solid #2A2D3A',
                  color: '#E8EAF0',
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#6B7280' }}>
                Target Scope
              </label>
              <input
                type="text"
                value={form.target}
                onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                placeholder="e.g. 192.168.1.0/24, hostname, or URL"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: '#0F1117',
                  border: '1px solid #2A2D3A',
                  color: '#E8EAF0',
                }}
              />
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
              Create Assessment
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Assessments() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [assessments, setAssessments] = useState(initialAssessments)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('lastRun')
  const [selected, setSelected] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showBulkDelete, setShowBulkDelete] = useState(false)

  const filtered = assessments
    .filter(a => {
      const matchSearch = a.name.toLowerCase().includes(search.toLowerCase())
      const matchFilter = filter === 'all' || a.status === filter
      return matchSearch && matchFilter
    })
    .sort((a, b) => {
      if (sort === 'lastRun') {
        if (!a.lastRun) return 1
        if (!b.lastRun) return -1
        return new Date(b.lastRun) - new Date(a.lastRun)
      }
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'findings') return b.findingCount - a.findingCount
      return 0
    })

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleSelectAll = () => {
    if (selected.length === filtered.length) {
      setSelected([])
    } else {
      setSelected(filtered.map(a => a.id))
    }
  }

  const handleCreate = (form) => {
    const newA = {
      id: Date.now(),
      name: form.name,
      description: form.description,
      target: form.target,
      status: 'draft',
      lastRun: null,
      findingCount: 0,
      criticalCount: 0,
      createdAt: new Date().toISOString(),
    }
    setAssessments(prev => [newA, ...prev])
    setShowCreate(false)
    addToast(`Assessment "${form.name}" created successfully`, 'success')
  }

  const handleDelete = (assessment) => {
    setAssessments(prev => prev.filter(a => a.id !== assessment.id))
    setDeleteTarget(null)
    addToast(`"${assessment.name}" deleted`, 'success')
  }

  const handleBulkDelete = () => {
    const names = assessments.filter(a => selected.includes(a.id)).map(a => a.name)
    setAssessments(prev => prev.filter(a => !selected.includes(a.id)))
    setSelected([])
    setShowBulkDelete(false)
    addToast(`${names.length} assessment${names.length > 1 ? 's' : ''} deleted`, 'success')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#E8EAF0' }}>Assessments</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
            {assessments.length} assessment{assessments.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:brightness-110"
          style={{ backgroundColor: '#4F8EF7', color: '#fff' }}
        >
          <Plus size={16} />
          New Assessment
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex items-center gap-2 flex-1 min-w-48 px-3 py-2 rounded-xl"
          style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
        >
          <Search size={15} style={{ color: '#6B7280' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search assessments..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#E8EAF0' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
            style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
          >
            <Filter size={14} style={{ color: '#6B7280' }} />
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="bg-transparent outline-none text-sm cursor-pointer"
              style={{ color: '#E8EAF0' }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="complete">Complete</option>
              <option value="draft">Draft</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer"
            style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
          >
            <ChevronDown size={14} style={{ color: '#6B7280' }} />
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="bg-transparent outline-none text-sm cursor-pointer"
              style={{ color: '#E8EAF0' }}
            >
              <option value="lastRun">Sort: Last Run</option>
              <option value="name">Sort: Name</option>
              <option value="findings">Sort: Findings</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2.5 rounded-xl animate-fade-in"
          style={{ backgroundColor: 'rgba(79,142,247,0.08)', border: '1px solid rgba(79,142,247,0.2)' }}
        >
          <span className="text-sm font-medium" style={{ color: '#4F8EF7' }}>
            {selected.length} selected
          </span>
          <button
            onClick={() => setShowBulkDelete(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'rgba(229,83,75,0.15)', color: '#E5534B' }}
          >
            <Trash2 size={14} />
            Delete Selected
          </button>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A' }}
      >
        {/* Table header */}
        <div
          className="grid items-center px-4 py-3 text-xs font-semibold uppercase tracking-wider"
          style={{
            gridTemplateColumns: '40px 1fr 120px 180px 80px 60px 40px',
            borderBottom: '1px solid #2A2D3A',
            color: '#6B7280',
          }}
        >
          <div>
            <input
              type="checkbox"
              checked={filtered.length > 0 && selected.length === filtered.length}
              onChange={toggleSelectAll}
              className="accent-primary cursor-pointer"
            />
          </div>
          <div>Name</div>
          <div>Status</div>
          <div>Last Run</div>
          <div>Findings</div>
          <div>Critical</div>
          <div />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p style={{ color: '#6B7280' }}>No assessments found</p>
          </div>
        ) : (
          filtered.map(a => (
            <div
              key={a.id}
              className="grid items-center px-4 py-3.5 table-row-hover cursor-pointer transition-colors"
              style={{
                gridTemplateColumns: '40px 1fr 120px 180px 80px 60px 40px',
                borderBottom: '1px solid #2A2D3A',
              }}
              onClick={() => navigate(`/assessments/${a.id}`)}
            >
              <div onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={() => toggleSelect(a.id)}
                  className="accent-primary cursor-pointer"
                />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{a.name}</p>
                <p className="text-xs mt-0.5 truncate" style={{ color: '#6B7280', maxWidth: '90%' }}>{a.description}</p>
              </div>
              <div>
                <StatusBadge status={a.status} />
              </div>
              <div className="text-sm" style={{ color: '#6B7280' }}>
                {formatDate(a.lastRun)}
              </div>
              <div className="text-sm font-medium" style={{ color: '#E8EAF0' }}>
                {a.findingCount}
              </div>
              <div className="text-sm font-semibold" style={{ color: a.criticalCount > 0 ? '#E5534B' : '#6B7280' }}>
                {a.criticalCount}
              </div>
              <div onClick={e => e.stopPropagation()}>
                <OverflowMenu
                  items={[
                    { label: 'View', onClick: () => navigate(`/assessments/${a.id}`) },
                    { label: 'Edit', onClick: () => {} },
                    { label: 'Run Now', onClick: () => addToast(`Starting run for "${a.name}"...`, 'info') },
                    { divider: true },
                    { label: 'Delete', danger: true, onClick: () => setDeleteTarget(a) },
                  ]}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      <CreateModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />

      {/* Delete Confirm */}
      {deleteTarget && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
          title={`Delete "${deleteTarget.name}"?`}
          description="This will permanently delete the assessment and all associated data."
          items={[
            `Assessment: ${deleteTarget.name}`,
            `${deleteTarget.findingCount} findings`,
            `All run history`,
          ]}
          requireTyping={deleteTarget.findingCount > 0}
          confirmName={deleteTarget.name}
          confirmLabel="Delete Assessment"
        />
      )}

      {/* Bulk Delete */}
      <ConfirmModal
        isOpen={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selected.length} assessments?`}
        description="This will permanently delete all selected assessments and their data."
        items={assessments.filter(a => selected.includes(a.id)).map(a => a.name)}
        requireTyping={false}
        confirmLabel="Delete All Selected"
      />
    </div>
  )
}
