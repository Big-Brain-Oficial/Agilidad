'use client';

import { useProgress } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { urlModelo, type Desarrollo } from '@/content/desarrollos';
import { useCurtain } from '@/components/transition/curtain-store';
import { Hud } from './Hud';
import { useExperience } from './store';
import { World } from './World';
import styles from './Experience.module.css';

// Recorrido 3D de un desarrollo. Se carga bajo demanda (next/dynamic) para que el mapa no
// descargue Three.js.

function ProgressBridge() {
  const { progress, active } = useProgress();
  useEffect(() => {
    if (active) useCurtain.getState().setProgress(progress);
  }, [progress, active]);
  return null;
}

export default function Experience({ desarrollo, debug = false }: { desarrollo: Desarrollo; debug?: boolean }) {
  const url = urlModelo(desarrollo.recorrido3d!.modelo);
  // No se dibuja hasta que los shaders están compilados: dibujar antes obliga al navegador a
  // esperar la compilación (en Windows/Direct3D puede congelar la página varios segundos).
  const [ready, setReady] = useState(false);

  useEffect(() => {
    useExperience.getState().reset();
    return () => {
      if (document.pointerLockElement) document.exitPointerLock();
      useExperience.getState().reset();
    };
  }, []);

  const onReady = useCallback(() => {
    setReady(true);
    useExperience.getState().setPhase('intro');
    // Un cuadro de margen para que la primera imagen ya esté dibujada al abrir la cortina.
    requestAnimationFrame(() => setTimeout(() => useCurtain.getState().reveal(), 120));
  }, []);

  return (
    <div className={styles.root}>
      <div id="marq-lock-target" className={styles.canvas}>
        <Canvas
          shadows="percentage"
          frameloop={ready ? 'always' : 'never'}
          dpr={[1, 1.75]}
          camera={{ fov: 70, near: 0.05, far: 3000 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NeutralToneMapping;
            gl.toneMappingExposure = 1;
          }}
        >
          <Suspense fallback={null}>
            <World url={url} debug={debug} onReady={onReady} />
          </Suspense>
        </Canvas>
      </div>
      <ProgressBridge />
      <Hud desarrollo={desarrollo} />
    </div>
  );
}
