import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Shell } from './components/layout/Shell'
import Dashboard from './pages/Dashboard'
import Courses from './pages/Courses'
import Resources from './pages/Resources'
import Syllabus from './pages/Syllabus'
import Assessments from './pages/Assessments'
import Planner from './pages/Planner'
import CalendarPage from './pages/CalendarPage'
import Tasks from './pages/Tasks'
import SettingsPage from './pages/SettingsPage'
import { registerBackup, useSettings } from './store/useStore'
import { useGoogle } from './store/useGoogle'
import { isStale, useSync } from './store/useSync'

export default function App() {
  const settings = useSettings()
  const initGoogle = useGoogle((s) => s.init)

  // Theme lives on <html> so the CSS variables cascade to portals too.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', settings.theme === 'dark')
    root.classList.toggle('light', settings.theme === 'light')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', settings.theme === 'dark' ? '#08080c' : '#f7f7f9')
  }, [settings.theme])

  // Always call it — init has its own empty-id branch that tears the client
  // down. Guarding here left a cleared client id reporting "ready".
  useEffect(() => {
    initGoogle(settings.googleClientId ?? '')
  }, [settings.googleClientId, initGoogle])

  return (
    <HashRouter>
      <SyncRunner />
      <SetupRedirect />
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/syllabus" element={<Syllabus />} />
          <Route path="/assessments" element={<Assessments />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

/**
 * Keeps the database talking to GitHub: pushes after edits, pulls when the app
 * opens and when a backgrounded tab comes back, and makes a last attempt to
 * save before the tab goes away.
 */
function SyncRunner() {
  const pull = useSync((s) => s.pull)
  const flush = useSync((s) => s.flush)
  const schedulePush = useSync((s) => s.schedulePush)

  useEffect(() => {
    registerBackup(schedulePush)
    return () => registerBackup(() => {})
  }, [schedulePush])

  useEffect(() => {
    if (!useSync.getState().configured()) return
    void pull({ silent: true })

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Last chance before the tab is frozen or closed.
        flush()
        return
      }
      // Coming back: the other device may have written while we were away.
      if (isStale()) void pull({ silent: true })
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [pull, flush])

  return null
}

/**
 * Sends a brand-new browser to Settings, where the sync credentials live. Only
 * from the landing route, and only once per tab, so it never traps someone who
 * wants to look around without setting anything up.
 */
function SetupRedirect() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (pathname !== '/') return
    if (useSync.getState().configured()) return
    try {
      if (sessionStorage.getItem('semestre.setupPrompted')) return
      sessionStorage.setItem('semestre.setupPrompted', '1')
    } catch {
      return // Storage blocked: better to show the app than to redirect forever.
    }
    navigate('/settings', { replace: true })
  }, [pathname, navigate])

  return null
}
