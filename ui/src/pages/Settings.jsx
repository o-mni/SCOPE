import React, { useState } from 'react'
import { Terminal, BookOpen, Folder, Shield, Moon, Trash2, AlertTriangle } from 'lucide-react'
import ConfirmModal from '../components/shared/ConfirmModal'
import { useToast } from '../App'

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
