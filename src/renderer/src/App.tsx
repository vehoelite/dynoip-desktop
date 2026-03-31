import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { SubdomainsPage } from './pages/SubdomainsPage'
import { TunnelsPage } from './pages/TunnelsPage'
import { DNSRecordsPage } from './pages/DNSRecordsPage'
import { ActivityPage } from './pages/ActivityPage'
import { PlansPage } from './pages/PlansPage'
import LoginPage from './pages/LoginPage'
import { Loader2 } from 'lucide-react'

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const [ready, setReady] = useState(false)

  // Only show the fullscreen spinner for the initial session restore.
  // Once the first load completes, never show it again — this prevents
  // login/register operations from unmounting the LoginPage.
  useEffect(() => {
    if (!loading && !ready) setReady(true)
  }, [loading, ready])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/subdomains" element={<SubdomainsPage />} />
        <Route path="/tunnels" element={<TunnelsPage />} />
        <Route path="/dns" element={<DNSRecordsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
