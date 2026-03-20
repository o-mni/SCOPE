import React, { createContext, useContext, useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Assessments from './pages/Assessments'
import AssessmentDetail from './pages/AssessmentDetail'
import Findings from './pages/Findings'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import LocalShell from './pages/LocalShell'
import ToastContainer from './components/shared/ToastContainer'

// Toast Context
export const ToastContext = createContext(null)
export function useToast() {
  return useContext(ToastContext)
}

// Sidebar Context
export const SidebarContext = createContext(null)
export function useSidebar() {
  return useContext(SidebarContext)
}

function AppProviders({ children }) {
  const [toasts, setToasts] = useState([])
  const [collapsed, setCollapsed] = useState(false)

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, duration }])
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast, toasts }}>
      <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
        {children}
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </SidebarContext.Provider>
    </ToastContext.Provider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/assessments" element={<Assessments />} />
            <Route path="/assessments/:id" element={<AssessmentDetail />} />
            <Route path="/findings" element={<Findings />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/shell" element={<LocalShell />} />
          </Route>
        </Routes>
      </AppProviders>
    </BrowserRouter>
  )
}
