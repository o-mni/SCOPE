import React, { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

const typeConfig = {
  success: {
    icon: CheckCircle,
    color: '#3ECF8E',
    bg: 'rgba(62, 207, 142, 0.12)',
    border: 'rgba(62, 207, 142, 0.25)',
  },
  error: {
    icon: AlertCircle,
    color: '#E5534B',
    bg: 'rgba(229, 83, 75, 0.12)',
    border: 'rgba(229, 83, 75, 0.25)',
  },
  info: {
    icon: Info,
    color: '#4F8EF7',
    bg: 'rgba(79, 142, 247, 0.12)',
    border: 'rgba(79, 142, 247, 0.25)',
  },
}

export default function Toast({ id, message, type = 'info', duration = 4000, onRemove }) {
  const [exiting, setExiting] = useState(false)
  const config = typeConfig[type] || typeConfig.info
  const Icon = config.icon

  const dismiss = () => {
    setExiting(true)
    setTimeout(() => onRemove(id), 300)
  }

  useEffect(() => {
    const timer = setTimeout(dismiss, duration)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className={exiting ? 'toast-exit' : 'toast-enter'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '12px',
        backgroundColor: '#1A1D27',
        border: `1px solid ${config.border}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        maxWidth: '360px',
        width: '100%',
        position: 'relative',
      }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg mt-0.5"
        style={{ backgroundColor: config.bg }}
      >
        <Icon size={16} style={{ color: config.color }} />
      </div>
      <p className="text-sm flex-1 pt-1" style={{ color: '#E8EAF0', lineHeight: '1.4' }}>
        {message}
      </p>
      <button
        onClick={dismiss}
        className="flex-shrink-0 mt-1 transition-colors"
        style={{ color: '#6B7280' }}
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
