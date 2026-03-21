import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Network, Shield, Users, Layers, Key,
  CheckCircle2, Circle, ChevronDown, ChevronRight,
  AlertTriangle, AlertCircle, Loader2,
} from 'lucide-react'
import { useToast } from '../App'

const API = 'http://localhost:8000/api'

const STEP_LABELS = ['Info', 'Coverage', 'Template', 'Preview', 'Confirm']

const DOMAIN_ICONS = {
  network:           Network,
  system_hardening:  Shield,
  identity_access:   Users,
  software_services: Layers,
  secrets_keys:      Key,
}

// ── Step 1: Basic Info ────────────────────────────────────────────────────────

function Step1({ form, setForm }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider mb-3" style={{ color: '#6B7280' }}>
          Basic assessment information
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: '#6B7280' }}>
          Assessment Name <span style={{ color: '#E5534B' }}>*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Web Server Quarterly Audit"
          autoFocus
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A', color: '#E8EAF0' }}
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
          className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
          style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A', color: '#E8EAF0' }}
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
          placeholder="localhost / 127.0.0.1"
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A', color: '#E8EAF0' }}
        />
      </div>
    </div>
  )
}

// ── Step 2: Coverage Selection ────────────────────────────────────────────────

function DomainCard({ domain, selectedModules, expandedDomains, setExpandedDomains, onToggleDomain, onToggleModule }) {
  const Icon = DOMAIN_ICONS[domain.id] || Shield
  const isExpanded = expandedDomains.has(domain.id)
  const selectedCount = domain.modules.filter(m => selectedModules.has(m.name)).length
  const totalCount = domain.modules.length
  const allSelected = selectedCount === totalCount
  const someSelected = selectedCount > 0 && selectedCount < totalCount

  const toggleExpand = (e) => {
    e.stopPropagation()
    setExpandedDomains(prev => {
      const next = new Set(prev)
      next.has(domain.id) ? next.delete(domain.id) : next.add(domain.id)
      return next
    })
  }

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        border: someSelected || allSelected
          ? '1px solid rgba(79,142,247,0.4)'
          : '1px solid #2A2D3A',
        backgroundColor: allSelected ? 'rgba(79,142,247,0.06)' : '#13161F',
      }}
    >
      {/* Card header — clicking toggles domain selection */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => onToggleDomain(domain)}
      >
        {/* Checkbox */}
        <div
          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
          style={{
            border: allSelected ? 'none' : someSelected ? '1.5px solid #4F8EF7' : '1.5px solid #3A3D4A',
            backgroundColor: allSelected ? '#4F8EF7' : someSelected ? 'rgba(79,142,247,0.15)' : 'transparent',
          }}
        >
          {allSelected && <span style={{ color: '#fff', fontSize: '10px' }}>✓</span>}
          {someSelected && <span style={{ color: '#4F8EF7', fontSize: '10px', fontWeight: 'bold' }}>–</span>}
        </div>

        {/* Icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: allSelected ? 'rgba(79,142,247,0.15)' : '#1A1D27' }}
        >
          <Icon size={15} style={{ color: allSelected ? '#4F8EF7' : '#6B7280' }} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{domain.label}</p>
          <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{domain.description}</p>
        </div>

        {/* Count + expand */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: selectedCount > 0 ? 'rgba(79,142,247,0.12)' : '#1A1D27',
              color: selectedCount > 0 ? '#4F8EF7' : '#6B7280',
            }}
          >
            {selectedCount}/{totalCount}
          </span>
          <button onClick={toggleExpand} style={{ color: '#6B7280' }}>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded module list */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #2A2D3A' }}>
          {domain.modules.map(mod => {
            const isSelected = selectedModules.has(mod.name)
            return (
              <div
                key={mod.name}
                className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/3"
                style={{ borderBottom: '1px solid #1E293B' }}
                onClick={(e) => { e.stopPropagation(); onToggleModule(mod.name) }}
              >
                <div
                  className="w-3.5 h-3.5 rounded mt-0.5 flex-shrink-0 flex items-center justify-center"
                  style={{
                    border: isSelected ? 'none' : '1.5px solid #3A3D4A',
                    backgroundColor: isSelected ? '#4F8EF7' : 'transparent',
                    marginTop: '3px',
                  }}
                >
                  {isSelected && <span style={{ color: '#fff', fontSize: '9px' }}>✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono" style={{ color: isSelected ? '#E8EAF0' : '#6B7280' }}>
                    {mod.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{mod.description}</p>
                  {mod.requiresRoot && (
                    <span className="text-xs" style={{ color: '#FBBF24' }}>⚠ requires root</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Step2({ form, domains, expandedDomains, setExpandedDomains, onToggleDomain, onToggleModule, onSelectAll, onClearAll }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider" style={{ color: '#6B7280' }}>
          Select coverage domains
        </p>
        <div className="flex gap-3">
          <button
            onClick={onSelectAll}
            className="text-xs hover:underline"
            style={{ color: '#4F8EF7' }}
          >
            Select All
          </button>
          <button
            onClick={onClearAll}
            className="text-xs hover:underline"
            style={{ color: '#6B7280' }}
          >
            Clear
          </button>
        </div>
      </div>

      {domains.length === 0 ? (
        <div className="py-8 text-center" style={{ color: '#6B7280' }}>
          <Loader2 size={18} className="animate-spin mx-auto mb-2" />
          Loading domains…
        </div>
      ) : (
        <div className="space-y-2">
          {domains.map(domain => (
            <DomainCard
              key={domain.id}
              domain={domain}
              selectedModules={form.selectedModules}
              expandedDomains={expandedDomains}
              setExpandedDomains={setExpandedDomains}
              onToggleDomain={onToggleDomain}
              onToggleModule={onToggleModule}
            />
          ))}
        </div>
      )}

      <div
        className="flex items-center justify-between px-3 py-2 rounded-lg"
        style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A' }}
      >
        <span className="text-xs" style={{ color: '#6B7280' }}>
          {form.selectedModules.size === 0 ? 'No modules selected' : `${form.selectedModules.size} module${form.selectedModules.size !== 1 ? 's' : ''} selected`}
        </span>
        {form.templateId && (
          <span className="text-xs" style={{ color: '#4F8EF7' }}>
            From template
          </span>
        )}
      </div>
    </div>
  )
}

// ── Step 3: Templates ─────────────────────────────────────────────────────────

function Step3({ form, templates, onApplyTemplate }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#6B7280' }}>
          Start from a template
        </p>
        <p className="text-xs" style={{ color: '#475569' }}>
          Applying a template will replace your current coverage selection. You can adjust it in Step 2.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="py-8 text-center" style={{ color: '#6B7280' }}>
          <Loader2 size={18} className="animate-spin mx-auto mb-2" />
          Loading templates…
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => {
            const isActive = form.templateId === t.id
            return (
              <div
                key={t.id}
                className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all"
                style={{
                  border: isActive ? '1px solid rgba(79,142,247,0.4)' : '1px solid #2A2D3A',
                  backgroundColor: isActive ? 'rgba(79,142,247,0.06)' : '#13161F',
                }}
                onClick={() => onApplyTemplate(t)}
              >
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{
                    border: isActive ? 'none' : '1.5px solid #3A3D4A',
                    backgroundColor: isActive ? '#4F8EF7' : 'transparent',
                  }}
                >
                  {isActive && <span style={{ color: '#fff', fontSize: '9px' }}>✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{t.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>{t.description}</p>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#1A1D27', color: '#6B7280' }}
                >
                  {t.moduleCount} modules
                </span>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-center" style={{ color: '#475569' }}>
        Skip this step if you've already configured coverage manually in Step 2.
      </p>
    </div>
  )
}

// ── Step 4: Capability Preview ────────────────────────────────────────────────

const STATUS_STYLE = {
  ready:   { color: '#4ADE80', icon: '✓' },
  limited: { color: '#FBBF24', icon: '⚠' },
  blocked: { color: '#F87171', icon: '✗' },
  unknown: { color: '#6B7280', icon: '?' },
}

function Step4({ preview, previewLoading, moduleCount }) {
  if (previewLoading || !preview) {
    return (
      <div className="py-12 flex flex-col items-center gap-3">
        <Loader2 size={20} className="animate-spin" style={{ color: '#4F8EF7' }} />
        <p className="text-sm" style={{ color: '#6B7280' }}>
          Checking system capabilities for {moduleCount} module{moduleCount !== 1 ? 's' : ''}…
        </p>
      </div>
    )
  }

  const readyCount   = preview.modules.filter(m => m.status === 'ready').length
  const limitedCount = preview.modules.filter(m => m.status === 'limited').length
  const blockedCount = preview.modules.filter(m => m.status === 'blocked').length

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#6B7280' }}>
          System capability check
        </p>
        <p className="text-xs" style={{ color: '#475569' }}>
          Running as {preview.isRoot ? 'root' : `uid ${preview.euid} (non-root)`}
        </p>
      </div>

      {/* Summary row */}
      <div className="flex gap-4 flex-wrap">
        {[
          { label: 'Ready',    count: readyCount,   color: '#4ADE80' },
          { label: 'Limited',  count: limitedCount, color: '#FBBF24' },
          { label: 'Blocked',  count: blockedCount, color: '#F87171' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="text-sm font-semibold" style={{ color: s.color }}>{s.count}</span>
            <span className="text-xs" style={{ color: '#6B7280' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Per-module list */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid #2A2D3A', maxHeight: '280px', overflowY: 'auto' }}
      >
        {preview.modules.map((mod, i) => {
          const s = STATUS_STYLE[mod.status] || STATUS_STYLE.unknown
          return (
            <div
              key={mod.name}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{
                borderBottom: i < preview.modules.length - 1 ? '1px solid #1E293B' : 'none',
                backgroundColor: '#13161F',
              }}
            >
              <span className="text-sm font-mono w-3 text-center" style={{ color: s.color }}>
                {s.icon}
              </span>
              <span className="text-xs font-mono flex-1" style={{ color: '#94A3B8' }}>
                {mod.name}
              </span>
              {mod.note && (
                <span className="text-xs" style={{ color: mod.status === 'blocked' ? '#F87171' : '#FBBF24' }}>
                  {mod.note}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <div
          className="flex items-start gap-2.5 p-3 rounded-lg"
          style={{ backgroundColor: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}
        >
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#FBBF24' }} />
          <div>
            {preview.warnings.map((w, i) => (
              <p key={i} className="text-xs" style={{ color: '#FBBF24' }}>{w}</p>
            ))}
          </div>
        </div>
      )}

      {blockedCount > 0 && (
        <div
          className="flex items-start gap-2.5 p-3 rounded-lg"
          style={{ backgroundColor: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}
        >
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#F87171' }} />
          <p className="text-xs" style={{ color: '#F87171' }}>
            {blockedCount} module{blockedCount !== 1 ? 's are' : ' is'} blocked due to missing tools.
            These tasks will show as Blocked in the checklist and can be investigated later.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Step 5: Confirmation ──────────────────────────────────────────────────────

function Step5({ form, domains }) {
  // Group selected modules by domain for display
  const domainGroups = []
  for (const domain of domains) {
    const selected = domain.modules.filter(m => form.selectedModules.has(m.name)).map(m => m.name)
    if (selected.length > 0) domainGroups.push({ domain, modules: selected })
  }

  const templateLabel = form.templateId
    ? form.templateId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-wider" style={{ color: '#6B7280' }}>
        Confirm assessment details
      </p>

      {/* Summary card */}
      <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#0F1117', border: '1px solid #2A2D3A' }}>
        <div className="flex justify-between">
          <span className="text-xs" style={{ color: '#6B7280' }}>Name</span>
          <span className="text-sm font-medium" style={{ color: '#E8EAF0' }}>{form.name}</span>
        </div>
        {form.target && (
          <div className="flex justify-between">
            <span className="text-xs" style={{ color: '#6B7280' }}>Target</span>
            <span className="text-sm font-mono" style={{ color: '#E8EAF0' }}>{form.target}</span>
          </div>
        )}
        {templateLabel && (
          <div className="flex justify-between">
            <span className="text-xs" style={{ color: '#6B7280' }}>Template</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(79,142,247,0.12)', color: '#4F8EF7' }}>
              {templateLabel}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-xs" style={{ color: '#6B7280' }}>Coverage</span>
          <span className="text-sm font-medium" style={{ color: '#E8EAF0' }}>
            {domainGroups.length} domains · {form.selectedModules.size} modules
          </span>
        </div>
      </div>

      {/* Domain breakdown */}
      <div className="space-y-1.5">
        {domainGroups.map(({ domain, modules }) => {
          const Icon = DOMAIN_ICONS[domain.id] || Shield
          return (
            <div
              key={domain.id}
              className="flex items-start gap-3 px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#13161F', border: '1px solid #1E293B' }}
            >
              <Icon size={13} className="mt-0.5 flex-shrink-0" style={{ color: '#6B7280' }} />
              <div>
                <span className="text-xs font-medium" style={{ color: '#E8EAF0' }}>{domain.label}</span>
                <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                  {modules.map(m => m.split('.').pop()).join(', ')}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
        style={{ backgroundColor: 'rgba(62,207,142,0.06)', border: '1px solid rgba(62,207,142,0.2)' }}
      >
        <CheckCircle2 size={13} style={{ color: '#3ECF8E' }} />
        <p className="text-xs" style={{ color: '#3ECF8E' }}>
          A checklist of {form.selectedModules.size} tasks will be generated immediately on creation.
        </p>
      </div>
    </div>
  )
}

// ── Wizard shell ──────────────────────────────────────────────────────────────

export default function CreateAssessmentWizard({ isOpen, onClose }) {
  const navigate     = useNavigate()
  const { addToast } = useToast()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name:            '',
    description:     '',
    target:          '',
    selectedModules: new Set(),
    templateId:      null,
  })
  const [domains,         setDomains]         = useState([])
  const [templates,       setTemplates]       = useState([])
  const [expandedDomains, setExpandedDomains] = useState(new Set())
  const [preview,         setPreview]         = useState(null)
  const [previewLoading,  setPreviewLoading]  = useState(false)
  const [saving,          setSaving]          = useState(false)

  // Load domains + templates when wizard opens
  useEffect(() => {
    if (!isOpen) return
    Promise.all([
      fetch(`${API}/domains`).then(r => r.json()).catch(() => []),
      fetch(`${API}/templates`).then(r => r.json()).catch(() => []),
    ]).then(([d, t]) => { setDomains(d); setTemplates(t) })
  }, [isOpen])

  // Fetch capability preview when entering step 4
  useEffect(() => {
    if (step !== 4 || form.selectedModules.size === 0) return
    setPreviewLoading(true)
    setPreview(null)
    const modules = [...form.selectedModules].join(',')
    fetch(`${API}/domains/preview?modules=${encodeURIComponent(modules)}`)
      .then(r => r.json())
      .then(data => { setPreview(data); setPreviewLoading(false) })
      .catch(() => setPreviewLoading(false))
  }, [step])

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setForm({ name: '', description: '', target: '', selectedModules: new Set(), templateId: null })
      setPreview(null)
      setExpandedDomains(new Set())
    }
  }, [isOpen])

  const toggleModule = useCallback((modName) => {
    setForm(f => {
      const next = new Set(f.selectedModules)
      next.has(modName) ? next.delete(modName) : next.add(modName)
      return { ...f, selectedModules: next, templateId: null }
    })
  }, [])

  const toggleDomain = useCallback((domain) => {
    const allSelected = domain.modules.every(m => form.selectedModules.has(m.name))
    setForm(f => {
      const next = new Set(f.selectedModules)
      if (allSelected) domain.modules.forEach(m => next.delete(m.name))
      else domain.modules.forEach(m => next.add(m.name))
      return { ...f, selectedModules: next, templateId: null }
    })
  }, [form.selectedModules])

  const applyTemplate = useCallback((template) => {
    setForm(f => ({
      ...f,
      selectedModules: new Set(template.modules),
      templateId: template.id,
    }))
  }, [])

  const selectAll = useCallback(() => {
    setForm(f => ({
      ...f,
      selectedModules: new Set(domains.flatMap(d => d.modules.map(m => m.name))),
      templateId: null,
    }))
  }, [domains])

  const clearAll = useCallback(() => {
    setForm(f => ({ ...f, selectedModules: new Set(), templateId: null }))
  }, [])

  const canNext = step === 1
    ? form.name.trim().length >= 2
    : step === 2
    ? form.selectedModules.size > 0
    : true

  const handleCreate = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         form.name.trim(),
          description:  form.description.trim(),
          target:       form.target.trim(),
          module_names: [...form.selectedModules],
          template_id:  form.templateId,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const created = await res.json()
      addToast(`Assessment "${created.name}" created`, 'success')
      onClose()
      navigate(`/assessments/${created.id}`)
    } catch (err) {
      addToast(`Failed to create assessment: ${err.message}`, 'error')
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const nextLabel = step === 3 ? 'Preview →' : step === 4 ? 'Review →' : 'Next →'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl mx-4 flex flex-col"
        style={{ backgroundColor: '#1A1D27', border: '1px solid #2A2D3A', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #2A2D3A' }}
        >
          <h2 className="text-base font-semibold" style={{ color: '#E8EAF0' }}>New Assessment</h2>
          <button
            onClick={onClose}
            className="hover:text-white transition-colors"
            style={{ color: '#6B7280' }}
          >
            ✕
          </button>
        </div>

        {/* Step indicator */}
        <div
          className="flex items-center px-6 py-3 gap-1.5"
          style={{ borderBottom: '1px solid #2A2D3A' }}
        >
          {STEP_LABELS.map((label, i) => (
            <React.Fragment key={i}>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: step > i + 1 ? '#3ECF8E' : step === i + 1 ? '#4F8EF7' : '#2A2D3A',
                    color: step >= i + 1 ? '#fff' : '#6B7280',
                  }}
                >
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span
                  className="text-xs hidden sm:block"
                  style={{ color: step === i + 1 ? '#E8EAF0' : '#6B7280' }}
                >
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div
                  className="flex-1 h-px"
                  style={{ backgroundColor: step > i + 1 ? 'rgba(62,207,142,0.3)' : '#2A2D3A' }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && <Step1 form={form} setForm={setForm} />}
          {step === 2 && (
            <Step2
              form={form}
              domains={domains}
              expandedDomains={expandedDomains}
              setExpandedDomains={setExpandedDomains}
              onToggleDomain={toggleDomain}
              onToggleModule={toggleModule}
              onSelectAll={selectAll}
              onClearAll={clearAll}
            />
          )}
          {step === 3 && (
            <Step3
              form={form}
              templates={templates}
              onApplyTemplate={applyTemplate}
            />
          )}
          {step === 4 && (
            <Step4
              preview={preview}
              previewLoading={previewLoading}
              moduleCount={form.selectedModules.size}
            />
          )}
          {step === 5 && <Step5 form={form} domains={domains} />}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: '1px solid #2A2D3A' }}
        >
          <button
            onClick={() => step === 1 ? onClose() : setStep(s => s - 1)}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5"
            style={{ color: '#E8EAF0', border: '1px solid #2A2D3A' }}
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>

          {step < 5 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
              style={{ backgroundColor: '#4F8EF7', color: '#fff', opacity: canNext ? 1 : 0.35 }}
            >
              {nextLabel}
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: '#3ECF8E', color: '#fff', opacity: saving ? 0.6 : 1 }}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? 'Creating…' : 'Create Assessment'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
