import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Bell, MoreHorizontal, X } from 'lucide-react'
import { useSidebar } from '../../App'

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/assessments': 'Assessments',
  '/findings': 'Findings',
  '/reports': 'Reports',
  '/settings': 'Settings',
}

export default function Header() {
  const { collapsed, setCollapsed } = useSidebar()
  const location = useLocation()
  const [showMenu, setShowMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const getTitle = () => {
    const path = location.pathname
    if (path.startsWith('/assessments/')) return 'Assessment Detail'
    return pageTitles[path] || 'SCOPE'
  }

  return (
    <header
      className="fixed top-0 right-0 z-20 flex items-center justify-between px-6"
      style={{
        height: '56px',
        left: collapsed ? '64px' : '240px',
        backgroundColor: '#1A1D27',
        borderBottom: '1px solid #2A2D3A',
        transition: 'left 0.3s ease-in-out',
      }}
    >
      {/* Left side */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: '#6B7280' }}
          title="Toggle sidebar"
        >
          <Menu size={18} />
        </button>
        <h1 className="text-base font-semibold" style={{ color: '#E8EAF0' }}>
          {getTitle()}
        </h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications)
              setShowMenu(false)
            }}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: '#6B7280' }}
          >
            <Bell size={16} />
            <span
              className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: '#E5534B' }}
            />
          </button>
          {showNotifications && (
            <div
              className="absolute right-0 top-full mt-2 w-72 rounded-xl shadow-xl z-50"
              style={{
                backgroundColor: '#1A1D27',
                border: '1px solid #2A2D3A',
              }}
            >
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #2A2D3A' }}>
                <span className="text-sm font-semibold" style={{ color: '#E8EAF0' }}>Notifications</span>
                <button onClick={() => setShowNotifications(false)}>
                  <X size={14} style={{ color: '#6B7280' }} />
                </button>
              </div>
              <div className="px-4 py-3">
                <div className="flex gap-3 py-2">
                  <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: '#E5534B' }} />
                  <div>
                    <p className="text-sm" style={{ color: '#E8EAF0' }}>Web Application Audit found 3 critical issues</p>
                    <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>2 hours ago</p>
                  </div>
                </div>
                <div className="flex gap-3 py-2">
                  <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: '#3ECF8E' }} />
                  <div>
                    <p className="text-sm" style={{ color: '#E8EAF0' }}>Linux Server Hardening run completed</p>
                    <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>Yesterday at 08:04</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Local badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{
            backgroundColor: 'rgba(62, 207, 142, 0.1)',
            border: '1px solid rgba(62, 207, 142, 0.25)',
            color: '#3ECF8E',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: '#3ECF8E' }}
          />
          Local
        </div>

        {/* Ellipsis menu */}
        <div className="relative">
          <button
            onClick={() => {
              setShowMenu(!showMenu)
              setShowNotifications(false)
            }}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: '#6B7280' }}
          >
            <MoreHorizontal size={16} />
          </button>
          {showMenu && (
            <div
              className="absolute right-0 top-full mt-2 w-44 rounded-xl shadow-xl z-50 py-1"
              style={{
                backgroundColor: '#1A1D27',
                border: '1px solid #2A2D3A',
              }}
            >
              {['About SCOPE', 'Documentation', 'Keyboard Shortcuts', 'Check for Updates'].map(item => (
                <button
                  key={item}
                  className="w-full text-left px-4 py-2 text-sm transition-colors hover:bg-white/5"
                  style={{ color: '#E8EAF0' }}
                  onClick={() => setShowMenu(false)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Backdrop to close dropdowns */}
      {(showMenu || showNotifications) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setShowMenu(false); setShowNotifications(false) }}
        />
      )}
    </header>
  )
}
