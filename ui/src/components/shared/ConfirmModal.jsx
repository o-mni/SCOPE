import React, { useState, useEffect } from 'react'
import { X, AlertTriangle } from 'lucide-react'

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  items = [],
  requireTyping = false,
  confirmName = '',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
}) {
  const [typedValue, setTypedValue] = useState('')

  useEffect(() => {
    if (!isOpen) setTypedValue('')
  }, [isOpen])

  if (!isOpen) return null

  const canConfirm = requireTyping ? typedValue === confirmName : true

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm()
    setTypedValue('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl mx-4 animate-fade-in"
        style={{
          backgroundColor: '#1A1D27',
          border: '1px solid #2A2D3A',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #2A2D3A' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg"
              style={{ backgroundColor: 'rgba(229, 83, 75, 0.15)' }}
            >
              <AlertTriangle size={18} style={{ color: '#E5534B' }} />
            </div>
            <h2 className="text-base font-semibold" style={{ color: '#E8EAF0' }}>
              {title}
            </h2>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm mb-4" style={{ color: '#6B7280' }}>
            {description}
          </p>

          {items.length > 0 && (
            <div
              className="rounded-lg p-3 mb-4"
              style={{ backgroundColor: 'rgba(229, 83, 75, 0.05)', border: '1px solid rgba(229, 83, 75, 0.15)' }}
            >
              <p className="text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: '#E5534B' }}>
                Will be deleted:
              </p>
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#E8EAF0' }}>
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#E5534B' }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {requireTyping && (
            <div className="mt-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#6B7280' }}>
                Type <span className="font-mono font-semibold" style={{ color: '#E8EAF0' }}>{confirmName}</span> to confirm
              </label>
              <input
                type="text"
                value={typedValue}
                onChange={e => setTypedValue(e.target.value)}
                placeholder={confirmName}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: '#0F1117',
                  border: `1px solid ${typedValue === confirmName ? '#3ECF8E' : '#2A2D3A'}`,
                  color: '#E8EAF0',
                }}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: '1px solid #2A2D3A' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
            style={{ color: '#E8EAF0', border: '1px solid #2A2D3A' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: canConfirm ? '#E5534B' : 'rgba(229, 83, 75, 0.3)',
              color: canConfirm ? '#fff' : 'rgba(255,255,255,0.4)',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
