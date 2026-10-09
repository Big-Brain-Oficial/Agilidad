'use client';

import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { OBJETOS_NATALINI } from '@/content/recorridos';
import type { WorldData } from './prepareWorld';
import { useExperience } from './store';
import styles from './Experience.module.css';

// Símbolo «i» flotando sobre los objetos con información. Se ve de lejos si no hay una pared en el
// medio; al acercarse se resalta y la tecla I abre la tarjeta del objeto (Hud).

const SHOW = 12; // distancia desde la que se ve el símbolo
const NEAR = 2.5; // distancia horizontal a la que la tecla I abre la tarjeta
const CLOSE = 4.5; // más lejos, la tarjeta abierta se cierra sola

const OBJETOS = OBJETOS_NATALINI.map((o) => ({ id: o.id, position: new THREE.Vector3(...o.marcador) }));

type State = 'oculto' | 'lejos' | 'cerca';

export function InfoMarkers({ world }: { world: WorldData }) {
  const camera = useThree((s) => s.camera);
  const markers = useRef<(HTMLDivElement | null)[]>([]);
  const states = useRef<State[]>([]);
  const ray = useRef(new THREE.Ray()).current;

  useFrame(() => {
    const ui = useExperience.getState();
    const active = ui.phase === 'playing' && !ui.riding;
    let seen: string | null = null;
    let best = NEAR;
    OBJETOS.forEach((o, i) => {
      const distance = camera.position.distanceTo(o.position);
      let visible = active && distance < SHOW;
      if (visible) {
        // Sin una pared entre los ojos y el símbolo (el BVH de colisiones alcanza).
        ray.origin.copy(camera.position);
        ray.direction.subVectors(o.position, camera.position).normalize();
        visible = !world.collider.raycastFirst(ray, THREE.DoubleSide, 0, Math.max(0, distance - 0.3));
      }
      const flat = Math.hypot(camera.position.x - o.position.x, camera.position.z - o.position.z);
      const near = visible && flat < best;
      if (near) {
        seen = o.id;
        best = flat;
      }
      // Se escribe en el DOM solo al cambiar: no hace falta volver a dibujar React en cada cuadro.
      const state: State = !visible ? 'oculto' : flat < NEAR ? 'cerca' : 'lejos';
      const el = markers.current[i];
      if (el && states.current[i] !== state) {
        states.current[i] = state;
        el.dataset.state = state;
      }
    });
    ui.setInfo(seen);
    const open = OBJETOS.find((o) => o.id === ui.infoOpen);
    if (open && (ui.riding || camera.position.distanceTo(open.position) > CLOSE)) ui.closeInfo();
  });

  return OBJETOS.map((o, i) => (
    // zIndexRange en 0: el símbolo queda debajo del HUD y de los paneles de inicio y pausa.
    <Html key={o.id} position={o.position} center zIndexRange={[0, 0]} pointerEvents="none">
      <div ref={(el) => { markers.current[i] = el; }} className={styles.marker} data-state="oculto" aria-hidden="true">
        i
      </div>
    </Html>
  ));
}
