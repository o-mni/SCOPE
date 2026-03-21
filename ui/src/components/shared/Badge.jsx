import React from 'react'

const statusStyles = {
  active: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  complete: 'bg-green-500/15 text-green-400 border border-green-500/30',
  draft: 'bg-gray-500/15 text-gray-400 border border-gray-500/30',
  failed: 'bg-red-500/15 text-red-400 border border-red-500/30',
}

const severityStyles = {
  critical: 'bg-red-500/15 text-red-400',
  high: 'bg-orange-500/15 text-orange-400',
  medium: 'bg-yellow-500/15 text-yellow-400',
  low: 'bg-blue-500/15 text-blue-400',
  info: 'bg-gray-500/15 text-gray-400',
}

const findingStatusStyles = {
  open: 'bg-red-500/15 text-red-400 border border-red-500/30',
  remediated: 'bg-green-500/15 text-green-400 border border-green-500/30',
  accepted: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
}

const formatStyles = {
  PDF: 'bg-red-500/15 text-red-400 border border-red-500/30',
  HTML: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  JSON: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  Markdown: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
}

export function StatusBadge({ status }) {
  const style = statusStyles[status?.toLowerCase()] || statusStyles.draft
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${style}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
    </span>
  )
}

export function SeverityBadge({ severity }) {
  const style = severityStyles[severity?.toLowerCase()] || severityStyles.info
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${style}`}>
      {severity || 'Info'}
    </span>
  )
}

export function FindingStatusBadge({ status }) {
  const style = findingStatusStyles[status?.toLowerCase()] || findingStatusStyles.open
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${style}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Open'}
    </span>
  )
}

export function FormatBadge({ format }) {
  const style = formatStyles[format] || 'bg-gray-500/15 text-gray-400 border border-gray-500/30'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${style}`}>
      {format}
    </span>
  )
}

export function RunStatusBadge({ status }) {
  const styles = {
    complete: 'bg-green-500/15 text-green-400',
    failed: 'bg-red-500/15 text-red-400',
    running: 'bg-blue-500/15 text-blue-400',
  }
  const style = styles[status?.toLowerCase()] || styles.complete
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${style}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
    </span>
  )
}

const taskStatusConfig = {
  not_planned:             { label: 'Pending',  cls: 'bg-gray-500/15 text-gray-400' },
  ready:                   { label: 'Ready',    cls: 'bg-blue-500/15 text-blue-400 border border-blue-500/30' },
  running:                 { label: 'Running',  cls: 'bg-yellow-500/15 text-yellow-400' },
  completed:               { label: 'Done',     cls: 'bg-green-500/15 text-green-400' },
  needs_manual_validation: { label: 'Review',   cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/30' },
  blocked:                 { label: 'Blocked',  cls: 'bg-red-500/10 text-red-400/70' },
  failed:                  { label: 'Failed',   cls: 'bg-red-500/15 text-red-400' },
  skipped:                 { label: 'Skipped',  cls: 'bg-gray-500/10 text-gray-500 line-through' },
}

export function TaskStatusBadge({ status }) {
  const cfg = taskStatusConfig[status] || taskStatusConfig.not_planned
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

const priorityConfig = {
  critical: { label: 'Critical', cls: 'bg-red-500/15 text-red-400' },
  high:     { label: 'High',     cls: 'bg-orange-500/15 text-orange-400' },
  medium:   { label: 'Medium',   cls: 'bg-yellow-500/15 text-yellow-400' },
  low:      { label: 'Low',      cls: 'bg-blue-500/15 text-blue-400' },
  info:     { label: 'Info',     cls: 'bg-gray-500/15 text-gray-400' },
}

export function PriorityBadge({ priority }) {
  const cfg = priorityConfig[priority] || priorityConfig.medium
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}
