'use client';

import { useEffect, useState } from 'react';
import type { Desarrollo } from '@/content/desarrollos';
import { AVISO_MODELO, ZONAS_NATALINI } from '@/content/recorridos';
import { useCurtainNavigate } from '@/components/transition/curtain-store';
import { useExperience } from './store';
import styles from './Experience.module.css';

function Controls() {
  return (
    <ul className={styles.controls}>
      <li>
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span> Caminar (o flechas)
      </li>
      <li>
        <span><kbd>Mouse</kbd></span> Mirar alrededor
      </li>
      <li>
        <span><kbd>Shift</kbd></span> Correr
      </li>
      <li>
        <span><kbd>E</kbd></span> Usar ascensor · subir al bus
      </li>
      <li>
        <span><kbd>Esc</kbd></span> Pausa
      </li>
    </ul>
  );
}

export function Hud({ desarrollo }: { desarrollo: Desarrollo }) {
  const phase = useExperience((s) => s.phase);
  const prompt = useExperience((s) => s.prompt);
  const zona = useExperience((s) => s.zona);
  const riding = useExperience((s) => s.riding);
  const lockError = useExperience((s) => s.lockError);
  const navigate = useCurtainNavigate();
  const info = ZONAS_NATALINI[zona];

  // Tarjeta de zona: aparece unos segundos al entrar a cada sector.
  const [showZone, setShowZone] = useState(false);
  useEffect(() => {
    if (phase !== 'playing') return;
    setShowZone(true);
    const t = setTimeout(() => setShowZone(false), 6000);
    return () => clearTimeout(t);
  }, [zona, phase]);

  // Salida por el MARQ Bus (o desde el menú de pausa): cortina y vuelta al mapa.
  useEffect(() => {
    if (phase === 'leaving') void navigate('/', 'Volviendo al mapa en el MARQ Bus');
  }, [phase, navigate]);

  const lock = () => useExperience.getState().lock();
  const leave = () => useExperience.getState().leave();

  return (
    <>
      <header className={styles.brand}>
        <span className={styles.brandMark}>MARQ</span>
        <span className={styles.brandSub}>
          <strong>{desarrollo.nombre}</strong>
          <span>{info.titulo}</span>
        </span>
      </header>

      {phase === 'playing' && (
        <>
          <div className={styles.crosshair} aria-hidden="true" />
          <aside className={styles.zone} data-visible={showZone || undefined} aria-live="polite">
            <strong>{info.titulo}</strong>
            <span>{info.texto}</span>
          </aside>
          {prompt && (
            <div className={styles.prompt} role="status">
              <kbd>E</kbd> {prompt}
            </div>
          )}
          {riding && <div className={styles.riding}>En el ascensor…</div>}
          <p className={styles.help}>
            <kbd>Esc</kbd> pausa · el <strong>MARQ Bus</strong> te lleva de vuelta al mapa
          </p>
        </>
      )}

      {phase === 'intro' && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="exp-title">
          <div className={styles.panel}>
            <span className={styles.kicker}>Recorrido 3D · primera persona</span>
            <h1 id="exp-title">{desarrollo.nombre}</h1>
            <p>
              Llegaste en el <strong>MARQ Bus</strong>. Entrá al hall, tomá el ascensor y recorré el departamento muestra. Cuando quieras volver al mapa,
              subite de nuevo al bus.
            </p>
            <Controls />
            <button type="button" className="btn btn-accent" onClick={lock} autoFocus>
              Comenzar recorrido
            </button>
            {lockError && <p className={styles.error}>El navegador no capturó el mouse. Hacé clic de nuevo.</p>}
            <p className={styles.note}>{AVISO_MODELO}</p>
          </div>
        </div>
      )}

      {phase === 'paused' && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <div className={styles.panel}>
            <span className={styles.kicker}>Pausa</span>
            <h1 id="pause-title">{info.titulo}</h1>
            <Controls />
            <div className={styles.actions}>
              <button type="button" className="btn btn-primary" onClick={lock} autoFocus>
                Continuar
              </button>
              <button type="button" className="btn btn-ghost" onClick={leave}>
                Volver al mapa
              </button>
            </div>
            {lockError && <p className={styles.error}>El navegador no capturó el mouse. Esperá un segundo y hacé clic en Continuar.</p>}
          </div>
        </div>
      )}
    </>
  );
}
