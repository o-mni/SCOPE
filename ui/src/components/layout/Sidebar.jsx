import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  FileText,
  Settings,
  Shield,
  TerminalSquare,
} from 'lucide-react'
import { useSidebar } from '../../App'

const navItems = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/assessments', icon: ClipboardList,   label: 'Assessments' },
  { to: '/findings',    icon: AlertTriangle,   label: 'Findings' },
  { to: '/reports',     icon: FileText,        label: 'Reports' },
  { to: '/shell',       icon: TerminalSquare,  label: 'Local Shell' },
]

const systemItems = [
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const { collapsed } = useSidebar()
  const navigate = useNavigate()

  return (
    <aside
      className="fixed top-0 left-0 h-full flex flex-col z-30 transition-all duration-300 ease-in-out"
      style={{
        width: collapsed ? '64px' : '240px',
        backgroundColor: '#1A1D27',
        borderRight: '1px solid #2A2D3A',
      }}
    >
      {/* Logo zone */}
      <div
        className="flex items-center h-14 px-4 cursor-pointer flex-shrink-0"
        style={{ borderBottom: '1px solid #2A2D3A' }}
        onClick={() => navigate('/dashboard')}
      >
        <div
          className="flex items-center justify-center flex-shrink-0 rounded-lg"
          style={{
            width: '32px',
            height: '32px',
            backgroundColor: '#4F8EF7',
            minWidth: '32px',
          }}
        >
          <Shield size={18} color="#fff" />
        </div>
        {!collapsed && (
          <span
            className="ml-3 font-bold text-lg tracking-widest select-none"
            style={{ color: '#E8EAF0', letterSpacing: '0.15em' }}
          >
            SCOPE
          </span>
        )}
      </div>

      {/* Primary nav */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-1 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center rounded-lg transition-all duration-150 group relative
                  ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
                  ${isActive
                    ? 'bg-white/5 text-white border-l-2 border-primary'
                    : 'text-text-muted hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      className="flex-shrink-0"
                      style={{ color: isActive ? '#4F8EF7' : undefined }}
                    />
                    {!collapsed && (
                      <span className="ml-3 text-sm font-medium">{label}</span>
                    )}
                    {collapsed && (
                      <div
                        className="absolute left-full ml-2 px-2 py-1 rounded text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
                        style={{
                          backgroundColor: '#2A2D3A',
                          color: '#E8EAF0',
                          border: '1px solid #3A3D4A',
                        }}
                      >
                        {label}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* System divider */}
        <div className="mt-6 mb-2 px-4">
          {!collapsed ? (
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: '#6B7280' }}
            >
              System
            </span>
          ) : (
            <div className="border-t" style={{ borderColor: '#2A2D3A' }} />
          )}
        </div>

        <ul className="space-y-1 px-2">
          {systemItems.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center rounded-lg transition-all duration-150 group relative
                  ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}
                  ${isActive
                    ? 'bg-white/5 text-white border-l-2 border-primary'
                    : 'text-text-muted hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      className="flex-shrink-0"
                      style={{ color: isActive ? '#4F8EF7' : undefined }}
                    />
                    {!collapsed && (
                      <span className="ml-3 text-sm font-medium">{label}</span>
                    )}
                    {collapsed && (
                      <div
                        className="absolute left-full ml-2 px-2 py-1 rounded text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
                        style={{
                          backgroundColor: '#2A2D3A',
                          color: '#E8EAF0',
                          border: '1px solid #3A3D4A',
                        }}
                      >
                        {label}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Version footer */}
      {!collapsed && (
        <div
          className="px-4 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid #2A2D3A' }}
        >
          <p className="text-xs" style={{ color: '#6B7280' }}>SCOPE v1.1.0</p>
          <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>Local instance</p>
        </div>
      )}
    </aside>
  )
}
