'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DESARROLLOS } from '@/content/desarrollos';
import { useCurtain, useCurtainNavigate } from '@/components/transition/curtain-store';
import styles from './Experience.module.css';

// Decide si se puede abrir el recorrido 3D (v1: solo computadoras con mouse y teclado)
// y lo carga bajo demanda.

const Experience = dynamic(() => import('./Experience'), { ssr: false });

type Support = 'checking' | 'ok' | 'mobile' | 'no-webgl';

function detect(): Support {
  const canvas = document.createElement('canvas');
  if (!canvas.getContext('webgl2')) return 'no-webgl';
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  return finePointer && window.innerWidth >= 900 ? 'ok' : 'mobile';
}

export function ExperienceGate({ desarrolloId }: { desarrolloId: string }) {
  const desarrollo = DESARROLLOS.find((d) => d.id === desarrolloId)!;
  const debug = useSearchParams().has('debug');
  const navigate = useCurtainNavigate();
  const [support, setSupport] = useState<Support>('checking');

  useEffect(() => {
    // Visita directa por URL: la cortina hace de pantalla de carga.
    const curtain = useCurtain.getState();
    if (curtain.status === 'hidden') curtain.coverNow(`Entrando a ${desarrollo.nombre}`);
    const result = detect();
    setSupport(result);
    if (result !== 'ok') curtain.reveal();
  }, [desarrollo.nombre]);

  if (support === 'ok') return <Experience desarrollo={desarrollo} debug={debug} />;
  if (support === 'checking') return null;

  return (
    <main className={styles.mobile}>
      <div className={styles.panel}>
        <span className={styles.kicker}>Recorrido 3D · {desarrollo.nombre}</span>
        <h1>Abrilo en una computadora</h1>
        <p>
          {support === 'no-webgl'
            ? 'Tu navegador no permite gráficos 3D (WebGL 2). Probá con una versión actualizada de Chrome, Edge, Firefox o Safari.'
            : 'Por ahora el recorrido en primera persona se maneja con teclado y mouse. En el teléfono podés seguir explorando el mapa de desarrollos.'}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => void navigate('/', 'Volviendo al mapa')}>
          Volver al mapa
        </button>
      </div>
    </main>
  );
}
