import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Library,
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
  { to: '/syllabus', label: 'Syllabus', short: 'Topics', icon: BookOpen },
  { to: '/assessments', label: 'Assessments', short: 'Work', icon: ClipboardList },
  { to: '/resources', label: 'Resources', short: 'Files', icon: Library },
  { to: '/planner', label: 'Study planner', short: 'Plan', icon: Timer },
  { to: '/calendar', label: 'Calendar', short: 'Cal', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', short: 'Tasks', icon: ListTodo },
  { to: '/settings', label: 'Settings', short: 'More', icon: SettingsIcon },
]
