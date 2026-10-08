'use client';

import { create } from 'zustand';
import type { ZonaId } from '@/content/recorridos';

// Estado compartido entre la escena 3D (dentro del <Canvas>) y la interfaz HTML.

export type Phase = 'loading' | 'intro' | 'playing' | 'paused' | 'leaving';

interface ExperienceState {
  phase: Phase;
  zona: ZonaId;
  /** Texto de la acción disponible (tecla E), o null. */
  prompt: string | null;
  riding: boolean;
  /** El navegador rechazó capturar el mouse (se puede reintentar con otro clic). */
  lockError: boolean;
  /** Bloquea el puntero (lo registra el control de primera persona). */
  lock: () => void;
  setPhase: (phase: Phase) => void;
  setZona: (zona: ZonaId) => void;
  setPrompt: (prompt: string | null) => void;
  setRiding: (riding: boolean) => void;
  setLockError: (lockError: boolean) => void;
  setLock: (lock: () => void) => void;
  leave: () => void;
  reset: () => void;
}

export const useExperience = create<ExperienceState>((set, get) => ({
  phase: 'loading',
  zona: 'exterior',
  prompt: null,
  riding: false,
  lockError: false,
  lock: () => {},
  setPhase: (phase) => set(phase === 'playing' ? { phase, lockError: false } : { phase }),
  setZona: (zona) => set({ zona }),
  setPrompt: (prompt) => {
    if (get().prompt !== prompt) set({ prompt });
  },
  setRiding: (riding) => set({ riding }),
  setLockError: (lockError) => set({ lockError }),
  setLock: (lock) => set({ lock }),
  leave: () => {
    if (get().phase === 'leaving') return;
    set({ phase: 'leaving', prompt: null });
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
  },
  reset: () => set({ phase: 'loading', zona: 'exterior', prompt: null, riding: false, lockError: false }),
}));
