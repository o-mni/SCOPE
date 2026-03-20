import React, { useState, useRef, useEffect } from 'react'
import { MoreHorizontal } from 'lucide-react'

export default function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/5"
        style={{ color: '#6B7280' }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 w-40 rounded-xl shadow-xl z-50 py-1"
          style={{
            backgroundColor: '#1A1D27',
            border: '1px solid #2A2D3A',
            top: '100%',
          }}
        >
          {items.map((item, i) => (
            item.divider ? (
              <div key={i} className="my-1" style={{ borderTop: '1px solid #2A2D3A' }} />
            ) : (
              <button
                key={i}
                className="w-full text-left px-4 py-2 text-sm transition-colors hover:bg-white/5"
                style={{ color: item.danger ? '#E5534B' : '#E8EAF0' }}
                onClick={() => {
                  setOpen(false)
                  item.onClick?.()
                }}
              >
                {item.label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  )
}
