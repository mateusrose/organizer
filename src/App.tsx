import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/layout/Shell'
import Dashboard from './pages/Dashboard'
import Courses from './pages/Courses'
import Assessments from './pages/Assessments'
import Planner from './pages/Planner'
import CalendarPage from './pages/CalendarPage'
import Tasks from './pages/Tasks'
import SettingsPage from './pages/SettingsPage'
import { useSettings } from './store/useStore'
import { useGoogle } from './store/useGoogle'

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

  useEffect(() => {
    if (settings.googleClientId) initGoogle(settings.googleClientId)
  }, [settings.googleClientId, initGoogle])

  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/assessments" element={<Assessments />} />
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
