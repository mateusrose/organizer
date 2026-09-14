import {
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  Settings as SettingsIcon,
  Timer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  short: string
  icon: LucideIcon
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { to: '/courses', label: 'Courses', short: 'Courses', icon: GraduationCap },
  { to: '/assessments', label: 'Assessments', short: 'Work', icon: ClipboardList },
  { to: '/planner', label: 'Study planner', short: 'Plan', icon: Timer },
  { to: '/calendar', label: 'Calendar', short: 'Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', short: 'Tasks', icon: ListTodo },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: SettingsIcon },
]
