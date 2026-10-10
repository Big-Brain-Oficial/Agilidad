'use client';

import { Environment, Sky, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { InfoMarkers } from './InfoMarkers';
import { MarqBus } from './MarqBus';
import { Player } from './Player';
import { Surroundings } from './Surroundings';
import { prepareWorld, type LightAnchor, type WorldData } from './prepareWorld';
import { useCurtain } from '@/components/transition/curtain-store';
import { useExperience } from './store';
import { ArchvizPost } from './ArchvizPost';

// Escena del recorrido: modelo de la torre, luces, cielo, entorno, MARQ Bus y visitante.

const INTERIOR_LIGHT = '#ffe6c7';

// Las texturas del GLB vienen en KTX2: el transcodificador (public/basis, copiado de
// three/examples/jsm/libs/basis) las pasa al formato comprimido que soporte la GPU. Uno solo para
// toda la sesión: sus workers se reusan al volver a entrar.
let ktx2Loader: KTX2Loader | null = null;
function getKtx2Loader(gl: THREE.WebGLRenderer) {
  ktx2Loader ??= new KTX2Loader().setTranscoderPath('/basis/');
  return ktx2Loader.detectSupport(gl);
}

/** Sube todas las texturas a la GPU. Si no, cada una se sube la primera vez que entra en cuadro y la imagen se traba. */
function uploadTextures(gl: THREE.WebGLRenderer, scene: THREE.Object3D) {
  const done = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const material = (o as THREE.Mesh).material;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture && !done.has(value)) {
          done.add(value);
          gl.initTexture(value);
        }
      }
    }
  });
}

/**
 * Agrupa las luminarias de Blender en pocas luces puntuales. Cada luz agranda los shaders de
 * todos los materiales y en Windows (Direct3D) compilarlos puede congelar la página varios
 * segundos. Como desde un piso no se ve el otro, los dos comparten las mismas luces: el hall usa
 * una y el piso del departamento tres (zona de día, zona de noche y pasillo). Más la de la cabina.
 */
function groupInteriorLights(world: WorldData) {
  const inside = (l: LightAnchor) => world.zones.some((z) => z.box.containsPoint(l.position));
  const points = world.lights.filter((l) => l.tipo !== 'SUN' && !l.enCabina && inside(l));
  const corridor = world.zones.find((z) => z.id === 'pasillo')?.box;
  const merge = (ls: LightAnchor[]) => {
    const energy = ls.reduce((n, l) => n + l.energia, 0);
    const position = ls.reduce((p, l) => p.addScaledVector(l.position, l.energia / energy), new THREE.Vector3());
    return { position, energy };
  };
  const levels = [points.filter((l) => l.position.y < 10), points.filter((l) => l.position.y >= 10)].map((level) => {
    // El pasillo tiene su propia luz: sumada a las del departamento, lo alumbraría desde atrás de sus paredes.
    const own = level.filter((l) => corridor?.containsPoint(l.position));
    const rest = level.filter((l) => !own.includes(l));
    const groups: LightAnchor[][] = own.length ? [own] : [];
    if (rest.length < 3) {
      if (rest.length) groups.push(rest);
      return groups.map(merge);
    }
    // Se parte en dos por el eje de mayor extensión.
    const spread = (k: 'x' | 'z') => Math.max(...rest.map((l) => l.position[k])) - Math.min(...rest.map((l) => l.position[k]));
    const axis = spread('x') > spread('z') ? 'x' : 'z';
    const sorted = [...rest].sort((a, b) => a.position[axis] - b.position[axis]);
    const half = Math.ceil(sorted.length / 2);
    groups.push(sorted.slice(0, half), sorted.slice(half));
    return groups.map(merge);
  });
  return { hall: levels[0], piso: levels[1] };
}

export function World({ url, debug, onReady }: { url: string; debug: boolean; onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  // Decodifica meshopt automáticamente; KTX2 con el transcodificador. drei usa el GLTFLoader de
  // three-stdlib, que acepta el KTX2Loader de three (más nuevo); solo difieren los tipos.
  const gltf = useGLTF(url, false, true, (loader) =>
    loader.setKTX2Loader(getKtx2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]));
  const scene = useThree((s) => s.scene);
  const atmosphere = useExperience((s) => s.atmosphere);
  const sunlight = useRef<THREE.DirectionalLight>(null);
  const lastInterior = useRef<boolean | null>(null);

  // Copia propia de la escena: el caché de useGLTF queda intacto si se vuelve a entrar.
  const model = useMemo(() => gltf.scene.clone(true), [gltf]);
  const world = useMemo(() => prepareWorld(model), [model]);
  const interiorLights = useMemo(() => groupInteriorLights(world), [world]);
  const pointLights = useRef<(THREE.PointLight | null)[]>([]);
  const lastUpstairs = useRef<boolean | null>(null);
  const cabinLight = world.lights.find((l) => l.enCabina);
  const sun = world.lights.find((l) => l.tipo === 'SUN');
  const sunDir = useMemo(() => (sun ? sun.direccion.clone() : new THREE.Vector3(0.5, -0.8, -0.3).normalize()), [sun]);

  // Escena estática: la sombra se recalcula solo cuando algo se mueve (el ascensor).
  // Antes de mostrarla se suben las texturas y se compilan todos los shaders en segundo plano
  // (compileAsync usa KHR_parallel_shader_compile): así no hay congelamientos al cargar ni al girar
  // la cámara.
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    gl.toneMappingExposure = atmosphere === 'dia' ? 1.05 : .94;
    gl.shadowMap.needsUpdate = true;
  }, [gl, atmosphere]);
  const warmup = useRef(4);
  useEffect(() => {
    let cancelled = false;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    useCurtain.getState().coverNow('Preparando la escena…');
    uploadTextures(gl, scene);
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
  useFrame(() => {
    const inside = camera.position.y > 10;
    if (inside === lastInterior.current || !sunlight.current) return;
    lastInterior.current = inside;
    const light = sunlight.current;
    // La resolución se concentra en el departamento cuando el visitante está arriba. El encuadre
    // abarca también el pasillo y la cabina: lo que queda afuera recibe sol aunque esté techado.
    sunTarget.position.set(inside ? -1.6 : 0, inside ? world.stops.at(-1)!.cabin.y + 1.2 : 2, inside ? -6.4 : -5);
    sunTarget.updateMatrixWorld();
    light.position.copy(sunTarget.position).addScaledVector(sunDir, -100);
    const extent = inside ? 8.2 : 25;
    Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 50, far: 160 });
    light.shadow.camera.updateProjectionMatrix();
    gl.shadowMap.needsUpdate = true;
  });

  // Las luces interiores pasan de un piso al otro a mitad del viaje, donde no alcanzan a la cabina.
  useFrame(() => {
    const upstairs = camera.position.y > (world.stops[0].cabin.y + world.stops.at(-1)!.cabin.y) / 2;
    if (upstairs === lastUpstairs.current) return;
    lastUpstairs.current = upstairs;
    const groups = upstairs ? interiorLights.piso : interiorLights.hall;
    pointLights.current.forEach((light, i) => {
      if (!light) return;
      // Sin grupo en este piso queda apagada, pero en la escena: quitarla recompilaría los shaders.
      light.intensity = groups[i] ? Math.min(85, groups[i].energy * 0.25) : 0;
      if (groups[i]) light.position.copy(groups[i].position);
    });
  });

  return (
    <>
      <Sky distance={2000} sunPosition={sunDir.clone().multiplyScalar(-1000).toArray()} turbidity={5} rayleigh={0.9} mieCoefficient={0.004} mieDirectionalG={0.82} />
      <fog attach="fog" args={['#dfe5e8', 140, 900]} />
      <Environment files="/archviz/rooftop_day/hdri.hdr" environmentIntensity={0.65} />
      <hemisphereLight args={['#e6eef5', '#b8ac98', 0.36]} />
      <primitive object={sunTarget} />
      <directionalLight
        ref={sunlight}
        position={sunPosition}
        target={sunTarget}
        intensity={atmosphere === 'dia' ? 2.8 : 1.85}
        color={atmosphere === 'dia' ? '#fff4e4' : '#ffd8ab'}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.00006}
        shadow-normalBias={0.012}
        shadow-radius={3}
        shadow-camera-left={-48}
        shadow-camera-right={48}
        shadow-camera-top={48}
        shadow-camera-bottom={-48}
        shadow-camera-near={1}
        shadow-camera-far={400}
      />

      <primitive object={model} />

      {/* Luces interiores, agrupadas a partir de las luminarias del modelo de Blender. Su posición e
          intensidad las fija el cuadro según el piso. */}
      {Array.from({ length: Math.max(interiorLights.hall.length, interiorLights.piso.length) }, (_, i) => (
        <pointLight key={i} ref={(l) => { pointLights.current[i] = l; }} distance={12} decay={2} color={INTERIOR_LIGHT} />
      ))}
      {/* La cabina lleva su propia luz: con las puertas cerradas no le llega la del hall ni la del pasillo. */}
      <primitive object={world.cabin}>
        {cabinLight && (
          <pointLight position={cabinLight.position} intensity={cabinLight.energia * 0.12} distance={4} decay={2} color={INTERIOR_LIGHT} />
        )}
      </primitive>

      <Surroundings />
      <MarqBus position={world.bus} />
      <Player world={world} debug={debug} />
      <InfoMarkers world={world} />
      <ArchvizPost />
    </>
  );
}
