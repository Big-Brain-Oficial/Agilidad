'use client';

import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ZonaId } from '@/content/recorridos';
import { resolveCapsule } from './collision';
import { useExperience } from './store';
import type { WorldData } from './prepareWorld';

// Control en primera persona: mouse para mirar (pointer lock), WASD/flechas para caminar,
// Shift para correr y E (o clic) para interactuar. La cámara está a la altura de los ojos y
// el cuerpo es una cápsula que colisiona contra el BVH del modelo.

const EYE = 1.65;
const RADIUS = 0.22; // pasa por las puertas de 0,5 m del modelo
const SEG_TOP = 0.1 - RADIUS; // la cápsula llega 10 cm por encima de los ojos
const SEG_BOTTOM = -EYE + RADIUS; // y apoya en el piso
const WALK = 2.4;
const RUN = 4.6;
const GRAVITY = -24;
const SUBSTEPS = 5;
const CABIN_FLOOR = 0.08; // altura del piso de la cabina respecto de su origen
const RIDE_SECONDS = 4.5;

const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
};

interface Interactable {
  label: string;
  action: () => void;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function Player({ world, debug }: { world: WorldData; debug: boolean }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const pressed = useRef(new Set<string>());
  const current = useRef<Interactable | null>(null);
  const s = useRef({
    pos: world.spawn.clone().add(new THREE.Vector3(0, EYE + 0.05, 0)),
    vel: new THREE.Vector3(),
    onGround: false,
    safe: world.spawn.clone().add(new THREE.Vector3(0, EYE, 0)),
    prev: new THREE.Vector3(),
    level: 0,
    ride: null as null | { from: number; to: number; t: number; target: number },
    bob: 0,
    frame: 0,
  });

  // Mirada inicial hacia el acceso del edificio.
  useEffect(() => {
    camera.position.copy(s.current.pos);
    camera.lookAt(world.lookAt);
    gl.shadowMap.needsUpdate = true;
  }, [camera, gl, world]);

  // Teclado.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      pressed.current.add(e.code);
      if (e.code === 'KeyE' && useExperience.getState().phase === 'playing') current.current?.action();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    };
    const up = (e: KeyboardEvent) => pressed.current.delete(e.code);
    const clear = () => pressed.current.clear();
    const click = () => {
      if (useExperience.getState().phase === 'playing' && document.pointerLockElement) current.current?.action();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    window.addEventListener('mousedown', click);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      window.removeEventListener('mousedown', click);
    };
  }, []);

  // El HUD bloquea el puntero con esta función (necesita un gesto del usuario).
  useEffect(() => {
    useExperience.getState().setLock(() => {
      // Se pide directamente para poder capturar el rechazo (p. ej. si se re-bloquea enseguida
      // después de salir con Esc). PointerLockControls detecta el bloqueo y dispara onLock.
      const markError = () => useExperience.getState().setLockError(true);
      try {
        const request = gl.domElement.requestPointerLock() as Promise<void> | undefined;
        request?.catch?.(markError);
      } catch {
        markError();
      }
      if (debug) useExperience.getState().setPhase('playing');
    });
  }, [debug, gl]);

  // API de depuración (?debug): para pruebas automatizadas sin mouse.
  useEffect(() => {
    if (!debug) return;
    const api = {
      teleport: (x: number, y: number, z: number) => {
        s.current.pos.set(x, y + EYE, z);
        s.current.vel.set(0, 0, 0);
      },
      look: (yaw: number, pitch = 0) => camera.rotation.set(pitch, yaw, 0, 'YXZ'),
      state: () => ({ pos: s.current.pos.toArray().map((v) => +v.toFixed(2)), onGround: s.current.onGround, level: s.current.level, ...useExperience.getState() }),
      press: (code: string, ms: number) => {
        pressed.current.add(code);
        return new Promise((r) => setTimeout(() => r(pressed.current.delete(code)), ms));
      },
      interact: () => current.current?.action(),
    };
    (window as unknown as { marq: typeof api }).marq = api;
  }, [debug, camera]);

  const forward = useRef(new THREE.Vector3()).current;
  const right = useRef(new THREE.Vector3()).current;
  const move = useRef(new THREE.Vector3()).current;
  const start = useRef(new THREE.Vector3()).current;
  const end = useRef(new THREE.Vector3()).current;
  const delta = useRef(new THREE.Vector3()).current;
  const up = useRef(new THREE.Vector3(0, 1, 0)).current;

  const inShaft = (p: THREE.Vector3) => p.x > world.shaft.min.x && p.x < world.shaft.max.x && p.z > world.shaft.min.z && p.z < world.shaft.max.z;
  const cabinFloor = () => world.cabin.position.y + CABIN_FLOOR;

  useFrame((_, rawDelta) => {
    const st = s.current;
    const dt = Math.min(rawDelta, 0.05);
    const ui = useExperience.getState();
    const canMove = ui.phase === 'playing' && !st.ride;
    const keys = pressed.current;
    const has = (list: string[]) => list.some((k) => keys.has(k));

    if (st.ride) {
      // Viaje en ascensor: la cabina y el visitante se mueven juntos.
      st.ride.t = Math.min(1, st.ride.t + dt / RIDE_SECONDS);
      world.cabin.position.y = st.ride.from + (st.ride.to - st.ride.from) * ease(st.ride.t);
      st.pos.y = cabinFloor() + EYE;
      gl.shadowMap.needsUpdate = true;
      if (st.ride.t >= 1) {
        st.level = st.ride.target;
        st.ride = null;
        st.safe.copy(st.pos);
        ui.setRiding(false);
      }
    } else {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, up);
      move.set(0, 0, 0);
      if (canMove) {
        if (has(KEYS.forward)) move.add(forward);
        if (has(KEYS.back)) move.sub(forward);
        if (has(KEYS.right)) move.add(right);
        if (has(KEYS.left)) move.sub(right);
      }
      const moving = move.lengthSq() > 0;
      if (moving) move.normalize().multiplyScalar(has(KEYS.run) ? RUN : WALK);

      st.prev.copy(st.pos);
      const h = dt / SUBSTEPS;
      for (let i = 0; i < SUBSTEPS; i++) {
        st.vel.y = st.onGround ? GRAVITY * h : st.vel.y + GRAVITY * h;
        st.pos.addScaledVector(st.vel, h);
        st.pos.addScaledVector(move, h);

        start.set(st.pos.x, st.pos.y + SEG_TOP, st.pos.z);
        end.set(st.pos.x, st.pos.y + SEG_BOTTOM, st.pos.z);
        resolveCapsule(world.collider, start, end, RADIUS, delta);

        st.onGround = delta.y > Math.abs(h * st.vel.y * 0.25);
        const offset = Math.max(0, delta.length() - 1e-5);
        delta.normalize().multiplyScalar(offset);
        st.pos.add(delta);
        if (st.onGround) st.vel.set(0, 0, 0);
        else {
          delta.normalize();
          st.vel.addScaledVector(delta, -delta.dot(st.vel));
        }

        // Piso de la cabina: solo existe donde está la cabina.
        if (inShaft(st.pos)) {
          const floorEye = cabinFloor() + EYE;
          if (st.pos.y < floorEye && st.pos.y > floorEye - 0.6) {
            st.pos.y = floorEye;
            st.vel.set(0, 0, 0);
            st.onGround = true;
          }
        }
      }

      // No se puede entrar al hueco si la cabina está en otro piso.
      if (inShaft(st.pos) && !inShaft(st.prev) && Math.abs(st.pos.y - EYE - cabinFloor()) > 1) {
        st.pos.x = st.prev.x;
        st.pos.z = st.prev.z;
      }

      // Si cae (bordes sin piso), vuelve al último lugar seguro.
      if (st.onGround && !inShaft(st.pos)) st.safe.copy(st.pos);
      if (st.pos.y < st.safe.y - 4) {
        st.pos.copy(st.safe);
        st.vel.set(0, 0, 0);
      }

      // Balanceo suave de la cámara al caminar.
      st.bob = moving && st.onGround ? st.bob + dt * (has(KEYS.run) ? 13 : 9) : 0;
    }

    camera.position.copy(st.pos);
    camera.position.y += Math.sin(st.bob) * 0.028;

    // Interacciones disponibles.
    let next: Interactable | null = null;
    if (!st.ride && ui.phase === 'playing') {
      const feet = st.pos.y - EYE;
      if (inShaft(st.pos) && Math.abs(feet - cabinFloor()) < 0.4 && world.levels.length > 1) {
        const target = st.level === 0 ? world.levels.length - 1 : 0;
        next = {
          label: st.level === 0 ? `Subir al departamento muestra (piso ${world.pisoDepto})` : 'Bajar al hall',
          action: () => {
            st.ride = { from: world.cabin.position.y, to: world.levels[target], t: 0, target };
            useExperience.getState().setRiding(true);
          },
        };
      } else if (st.pos.distanceTo(world.busDoor.clone().setY(st.pos.y)) < 2.2) {
        next = { label: 'Subir al MARQ Bus · volver al mapa', action: () => useExperience.getState().leave() };
      }
    }
    current.current = next;
    ui.setPrompt(next?.label ?? null);

    // Zona actual (cada pocos cuadros).
    if (st.frame++ % 8 === 0) {
      const feetPoint = new THREE.Vector3(st.pos.x, st.pos.y - EYE + 0.5, st.pos.z);
      const zona: ZonaId = world.zones.find((z) => z.box.containsPoint(feetPoint))?.id ?? 'exterior';
      if (zona !== ui.zona) ui.setZona(zona);
    }
  });

  return (
    <PointerLockControls
      selector="#marq-lock-target"
      onLock={() => useExperience.getState().setPhase('playing')}
      onUnlock={() => {
        const { phase } = useExperience.getState();
        if (phase === 'playing') useExperience.getState().setPhase('paused');
      }}
    />
  );
}
