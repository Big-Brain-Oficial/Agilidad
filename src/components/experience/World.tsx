'use client';

import { Sky, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MarqBus } from './MarqBus';
import { Player } from './Player';
import { Surroundings } from './Surroundings';
import { prepareWorld, type LightAnchor, type WorldData } from './prepareWorld';
import { useCurtain } from '@/components/transition/curtain-store';

// Escena del recorrido: modelo de la torre, luces, cielo, entorno, MARQ Bus y visitante.

const INTERIOR_LIGHT = '#ffe6c7';

/**
 * Agrupa las luminarias de Blender en pocas luces puntuales. Cada luz agranda los shaders de
 * todos los materiales y en Windows (Direct3D) compilarlos puede congelar la página varios
 * segundos: 9 luces → 3 (hall, zona de día y zona de noche del departamento).
 */
function groupInteriorLights(world: WorldData) {
  const inside = (l: LightAnchor) => world.zones.some((z) => z.box.containsPoint(l.position));
  const points = world.lights.filter((l) => l.tipo !== 'SUN' && !l.enCabina && inside(l));
  const merge = (ls: LightAnchor[]) => {
    const energy = ls.reduce((n, l) => n + l.energia, 0);
    const position = ls.reduce((p, l) => p.addScaledVector(l.position, l.energia / energy), new THREE.Vector3());
    return { position, energy };
  };
  const groups: LightAnchor[][] = [];
  for (const level of [points.filter((l) => l.position.y < 10), points.filter((l) => l.position.y >= 10)]) {
    if (level.length < 3) {
      if (level.length) groups.push(level);
      continue;
    }
    // Se parte en dos por el eje de mayor extensión.
    const spread = (k: 'x' | 'z') => Math.max(...level.map((l) => l.position[k])) - Math.min(...level.map((l) => l.position[k]));
    const axis = spread('x') > spread('z') ? 'x' : 'z';
    const sorted = [...level].sort((a, b) => a.position[axis] - b.position[axis]);
    const half = Math.ceil(sorted.length / 2);
    groups.push(sorted.slice(0, half), sorted.slice(half));
  }
  return groups.map(merge);
}

export function World({ url, debug, onReady }: { url: string; debug: boolean; onReady: () => void }) {
  const gltf = useGLTF(url); // decodifica meshopt automáticamente
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  // Copia propia de la escena: el caché de useGLTF queda intacto si se vuelve a entrar.
  const model = useMemo(() => gltf.scene.clone(true), [gltf]);
  const world = useMemo(() => prepareWorld(model), [model]);
  const interiorLights = useMemo(() => groupInteriorLights(world), [world]);
  const sun = world.lights.find((l) => l.tipo === 'SUN');
  const sunDir = useMemo(() => (sun ? sun.direccion.clone() : new THREE.Vector3(0.5, -0.8, -0.3).normalize()), [sun]);

  // Escena estática: la sombra se recalcula solo cuando algo se mueve (el ascensor).
  // Antes de mostrarla se compilan todos los shaders en segundo plano (compileAsync usa
  // KHR_parallel_shader_compile): así no hay congelamientos al cargar ni al girar la cámara.
  const camera = useThree((s) => s.camera);
  const warmup = useRef(4);
  useEffect(() => {
    let cancelled = false;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    useCurtain.getState().coverNow('Preparando la escena…');
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) onReady();
      });
    return () => {
      cancelled = true;
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl, scene, camera, onReady]);
  useFrame(() => {
    if (warmup.current > 0) {
      warmup.current--;
      gl.shadowMap.needsUpdate = true;
    }
  });

  const sunTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 0, -6);
    return o;
  }, []);
  const sunPosition = useMemo(() => sunTarget.position.clone().addScaledVector(sunDir, -140), [sunTarget, sunDir]);

  return (
    <>
      <Sky distance={2000} sunPosition={sunDir.clone().multiplyScalar(-1000).toArray()} turbidity={5} rayleigh={0.9} mieCoefficient={0.004} mieDirectionalG={0.82} />
      <fog attach="fog" args={['#dfe5e8', 140, 900]} />
      {/* Sin mapa de entorno (PMREM): generarlo compila shaders pesados de forma sincrónica y en
          Windows congelaba la carga ~2 s. La luz ambiente se resuelve con hemisférica + ambiental. */}
      <hemisphereLight args={['#f1f5f8', '#b7ae9e', 1.35]} />
      <ambientLight intensity={0.35} color="#fff8ee" />
      <primitive object={sunTarget} />
      <directionalLight
        position={sunPosition}
        target={sunTarget}
        intensity={2.6}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={2}
        shadow-camera-left={-48}
        shadow-camera-right={48}
        shadow-camera-top={48}
        shadow-camera-bottom={-48}
        shadow-camera-near={1}
        shadow-camera-far={400}
      />

      <primitive object={model} />

      {/* Luces interiores, agrupadas a partir de las luminarias del modelo de Blender. */}
      {interiorLights.map((l, i) => (
        <pointLight key={i} position={l.position} intensity={Math.min(240, l.energy * 0.32)} distance={14} decay={1.6} color={INTERIOR_LIGHT} />
      ))}
      <primitive object={world.cabin} />

      <Surroundings />
      <MarqBus position={world.bus} />
      <Player world={world} debug={debug} />
    </>
  );
}
