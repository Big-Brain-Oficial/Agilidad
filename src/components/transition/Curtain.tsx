'use client';

import { useCurtain } from './curtain-store';
import styles from './Curtain.module.css';

export function Curtain() {
  const { status, label, origin, progress } = useCurtain();
  if (status === 'hidden') return null;

  const x = origin ? `${origin.x}px` : '50%';
  const y = origin ? `${origin.y}px` : '50%';

  return (
    <div
      className={styles.curtain}
      data-status={status}
      style={{ '--origin-x': x, '--origin-y': y } as React.CSSProperties}
      role="status"
      aria-live="polite"
    >
      <div className={styles.content}>
        <span className={styles.mark}>MARQ</span>
        <span className={styles.label}>{label}</span>
        {progress !== null && (
          <div className={styles.progress} aria-label={`Cargando ${Math.round(progress)}%`}>
            <div className={styles.bar} style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        )}
      </div>
    </div>
  );
}
