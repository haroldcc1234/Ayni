import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface AppState {
  ready: boolean;
  currentProfileId: string;
  emergencyMode: boolean;
  simulatedOffline: boolean;
  online: boolean;
  syncPending: number;
  syncConflicts: number;
  lastSyncAt: string;
  toasts: Toast[];
  publishOpen: boolean;
  publishDefault: 'auto' | 'alert';
  setReady: (ready: boolean) => void;
  setCurrentProfileId: (id: string) => void;
  setEmergencyMode: (enabled: boolean) => void;
  setSimulatedOffline: (enabled: boolean) => void;
  refreshOnline: () => void;
  setSyncPending: (count: number) => void;
  setSyncConflicts: (count: number) => void;
  setLastSyncAt: (iso: string) => void;
  toast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  openPublish: (defaultType?: 'auto' | 'alert') => void;
  closePublish: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  currentProfileId: 'p-carlos',
  emergencyMode: false,
  simulatedOffline: false,
  online: true,
  syncPending: 0,
  syncConflicts: 0,
  lastSyncAt: '',
  toasts: [],
  publishOpen: false,
  publishDefault: 'auto',

  setReady: (ready) => set({ ready }),

  setCurrentProfileId: (currentProfileId) => set({ currentProfileId }),

  setEmergencyMode: (emergencyMode) => set({ emergencyMode }),

  setSimulatedOffline: (simulatedOffline) => {
    set({
      simulatedOffline,
      online: navigator.onLine && !simulatedOffline,
    });
  },

  refreshOnline: () =>
    set({ online: navigator.onLine && !get().simulatedOffline }),

  setSyncPending: (syncPending) => set({ syncPending }),

  setSyncConflicts: (syncConflicts) => set({ syncConflicts }),

  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),

  toast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts.slice(-2), { ...toast, id }],
    }));
    window.setTimeout(() => {
      get().dismissToast(id);
    }, 4200);
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  openPublish: (defaultType = 'auto') =>
    set({ publishOpen: true, publishDefault: defaultType }),

  closePublish: () =>
    set({ publishOpen: false, publishDefault: 'auto' }),
}));
