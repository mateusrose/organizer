import { create } from 'zustand'
import { uid } from '../lib/id'

export type ToastTone = 'success' | 'error' | 'info'
export interface Toast {
  id: string
  tone: ToastTone
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, tone?: ToastTone) => void
  dismiss: (id: string) => void
}

export const useToast = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (message, tone = 'info') => {
    const id = uid('tst')
    set({ toasts: [...get().toasts, { id, tone, message }] })
    setTimeout(() => get().dismiss(id), 4000)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

/** Imperative helper for non-component code. */
export const toast = {
  success: (m: string) => useToast.getState().push(m, 'success'),
  error: (m: string) => useToast.getState().push(m, 'error'),
  info: (m: string) => useToast.getState().push(m, 'info'),
}
