'use client';

import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useExperience } from './store';
import { BUS, BUS_DOOR } from './prepareWorld';

// El MARQ Bus: portal de salida del recorrido. Está estacionado junto al cordón, con el frente
// hacia +x y la puerta del lado de la vereda (-z). Subirse (E) vuelve al mapa.

function textTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, font: string) => void, w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const paint = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'sans-serif';
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h, font);
    texture.needsUpdate = true;
  };
  paint();
  // Repinta cuando termina de cargar la tipografía de la marca.
  void document.fonts?.ready.then(paint);
  return texture;
}

export function MarqBus({ position }: { position: THREE.Vector3 }) {
  const glow = useRef<THREE.MeshStandardMaterial>(null);

  const sideLabel = useMemo(
    () =>
      textTexture((ctx, w, h, font) => {
        ctx.fillStyle = '#1d1d1f';
        ctx.font = `800 120px ${font}`;
        ctx.textBaseline = 'middle';
        if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '18px';
        ctx.fillText('MARQ', 40, h / 2 + 6);
        const mw = ctx.measureText('MARQ').width;
        if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
        ctx.font = `500 110px ${font}`;
        ctx.fillStyle = '#A4070F';
        ctx.fillText('Bus', 40 + mw + 40, h / 2 + 6);
      }, 1024, 170),
    []
  );

  const sign = useMemo(
    () =>
      textTexture((ctx, w, h, font) => {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffb547';
        ctx.font = `700 64px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MAPA MARQ', w / 2, h / 2 + 4);
      }, 512, 96),
    []
  );

  useEffect(() => () => {
    sideLabel.dispose();
    sign.dispose();
  }, [sideLabel, sign]);

  // La puerta brilla cuando el visitante está lo bastante cerca para subir.
  useFrame(({ clock }) => {
    if (!glow.current) return;
    const near = useExperience.getState().prompt?.includes('MARQ Bus');
    glow.current.emissiveIntensity = near ? 1.4 + Math.sin(clock.elapsedTime * 5) * 0.6 : 0.25;
  });

  const L = BUS.length, W = BUS.width;
  const body = { y0: 0.55, h: 2.75 };
  const glass = <meshStandardMaterial color="#2a3640" roughness={0.18} metalness={0.2} />;

  return (
    <group position={position}>
      <RoundedBox args={[L, body.h, W]} radius={0.22} smoothness={4} position={[0, body.y0 + body.h / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f5f4f0" roughness={0.35} metalness={0.15} />
      </RoundedBox>
      {/* Paños vidriados laterales, parabrisas y luneta. */}
      <mesh position={[-0.4, 2.55, 0]}>
        <boxGeometry args={[L - 1.4, 1.0, W + 0.02]} />
        {glass}
      </mesh>
      <mesh position={[L / 2 + 0.005, 2.25, 0]}>
        <boxGeometry args={[0.04, 1.5, W - 0.25]} />
        {glass}
      </mesh>
      <mesh position={[-L / 2 - 0.005, 2.6, 0]}>
        <boxGeometry args={[0.04, 0.9, W - 0.45]} />
        {glass}
      </mesh>
      {/* Franja roja MARQ y zócalo. */}
      <mesh position={[0, 1.62, 0]}>
        <boxGeometry args={[L + 0.02, 0.18, W + 0.03]} />
        <meshStandardMaterial color="#A4070F" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[L - 0.3, 0.36, W - 0.06]} />
        <meshStandardMaterial color="#2a2c2e" roughness={0.6} />
      </mesh>
      {/* Rótulos "MARQ Bus" en ambos lados y cartel de destino. */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[-1.2, 1.12, side * (W / 2 + 0.02)]} rotation-y={side > 0 ? 0 : Math.PI}>
          <planeGeometry args={[4.2, 0.7]} />
          <meshBasicMaterial map={sideLabel} transparent toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[L / 2 + 0.03, 3.08, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[1.9, 0.36]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      {/* Puerta del lado de la vereda, con marco luminoso. */}
      <mesh position={[BUS_DOOR.x, 1.72, -W / 2 - 0.035]}>
        <boxGeometry args={[1.45, 2.5, 0.03]} />
        <meshStandardMaterial ref={glow} color="#A4070F" emissive="#ff2a35" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[BUS_DOOR.x, 1.72, -W / 2 - 0.055]}>
        <boxGeometry args={[1.2, 2.3, 0.02]} />
        {glass}
      </mesh>
      {/* Ruedas. */}
      {[3.7, -3.5].flatMap((x) =>
        [1, -1].map((side) => (
          <group key={`${x}${side}`} position={[x, 0.52, side * (W / 2 - 0.2)]} rotation-x={Math.PI / 2}>
            <mesh castShadow>
              <cylinderGeometry args={[0.52, 0.52, 0.36, 28]} />
              <meshStandardMaterial color="#151515" roughness={0.8} />
            </mesh>
            <mesh position={[0, side * 0.185, 0]}>
              <cylinderGeometry args={[0.28, 0.28, 0.02, 20]} />
              <meshStandardMaterial color="#c4c4c4" metalness={0.2} roughness={0.35} />
            </mesh>
          </group>
        ))
      )}
      {/* Aire acondicionado, espejos y luces. */}
      <mesh position={[-1.6, body.y0 + body.h + 0.15, 0]} castShadow>
        <boxGeometry args={[2.6, 0.3, 1.7]} />
        <meshStandardMaterial color="#e4e2dc" roughness={0.5} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={side} position={[L / 2 + 0.25, 2.55, side * (W / 2 + 0.15)]}>
          <boxGeometry args={[0.12, 0.42, 0.2]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      ))}
      {[0.85, -0.85].map((z) => (
        <group key={z}>
          <mesh position={[L / 2 + 0.01, 0.98, z]}>
            <boxGeometry args={[0.04, 0.18, 0.42]} />
            <meshStandardMaterial color="#fff" emissive="#fff6e0" emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[-L / 2 - 0.01, 1.05, z]}>
            <boxGeometry args={[0.04, 0.22, 0.32]} />
            <meshStandardMaterial color="#7a0b10" emissive="#ff2030" emissiveIntensity={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
