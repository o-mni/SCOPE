import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useSidebar } from '../../App'

export default function Layout() {
  const { collapsed } = useSidebar()

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0F1117' }}>
      <Sidebar />
      <Header />
      <main
        className="transition-all duration-300 ease-in-out"
        style={{
          marginLeft: collapsed ? '64px' : '240px',
          marginTop: '56px',
          minHeight: 'calc(100vh - 56px)',
        }}
      >
        <div
          className="mx-auto px-6 py-6"
          style={{ maxWidth: '1280px' }}
        >
          <Outlet />
        </div>
      </main>
    </div>
  )
}
