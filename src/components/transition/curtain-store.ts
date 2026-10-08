'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { create } from 'zustand';

// Cortina de transición entre el mapa 2D y el recorrido 3D.
// Vive en el layout raíz, así que sobrevive a los cambios de ruta: la página de origen la cierra
// y la de destino la abre cuando terminó de cargar.

export type CurtainStatus = 'hidden' | 'covering' | 'covered' | 'revealing';
export const COVER_MS = 650;
const REVEAL_MS = 550;

interface CurtainState {
  status: CurtainStatus;
  label: string;
  /** Punto (px de pantalla) desde donde se expande la cortina. */
  origin: { x: number; y: number } | null;
  /** Progreso de carga 0..100, o null si no aplica. */
  progress: number | null;
  cover: (label: string, origin?: { x: number; y: number } | null) => Promise<void>;
  coverNow: (label: string) => void;
  setProgress: (progress: number | null) => void;
  reveal: () => void;
}

export const useCurtain = create<CurtainState>((set, get) => ({
  status: 'hidden',
  label: '',
  origin: null,
  progress: null,
  cover: (label, origin = null) =>
    new Promise((resolve) => {
      set({ status: 'covering', label, origin, progress: null });
      setTimeout(() => {
        if (get().status === 'covering') set({ status: 'covered' });
        resolve();
      }, COVER_MS);
    }),
  coverNow: (label) => set({ status: 'covered', label, origin: null, progress: null }),
  setProgress: (progress) => set({ progress }),
  reveal: () => {
    const { status } = get();
    if (status === 'hidden' || status === 'revealing') return;
    set({ status: 'revealing' });
    setTimeout(() => {
      if (get().status === 'revealing') set({ status: 'hidden', progress: null });
    }, REVEAL_MS);
  },
}));

/** Navega cerrando antes la cortina (con el texto y el punto de origen indicados). */
export function useCurtainNavigate() {
  const router = useRouter();
  return useCallback(
    async (href: string, label: string, origin?: { x: number; y: number } | null) => {
      router.prefetch(href);
      await useCurtain.getState().cover(label, origin);
      router.push(href);
    },
    [router]
  );
}
