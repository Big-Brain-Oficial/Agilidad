'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

// Contexto urbano simple alrededor del lote: suelo, manzanas vecinas con volúmenes blancos
// (lenguaje de maqueta) y algunos árboles en la vereda de enfrente. No colisiona: está más allá
// de las paredes invisibles del recorrido.

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = ['#f4f2ec', '#ece8df', '#e6e2d8', '#f8f7f3', '#dcd8cd'];

export function Surroundings() {
  const { buildings, trunks, canopies } = useMemo(() => {
    const rnd = rng(104);
    const items: { x: number; z: number; w: number; d: number; h: number }[] = [];
    const cell = 30;
    for (let cx = -150; cx < 150; cx += cell) {
      for (let cz = -150; cz < 150; cz += cell) {
        // Fuera del área del recorrido (calle, vereda y terreno de la torre) más un margen.
        if (cx + cell > -40 && cx < 40 && cz + cell > -26 && cz < 16) continue;
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const w = 8 + rnd() * 12, d = 8 + rnd() * 12;
          const tall = rnd() < 0.18;
          items.push({ x: cx + 4 + rnd() * (cell - 8 - w) + w / 2, z: cz + 4 + rnd() * (cell - 8 - d) + d / 2, w, d, h: tall ? 30 + rnd() * 45 : 6 + rnd() * 16 });
        }
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4(), color = new THREE.Color();
    items.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, -0.3, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.set(PALETTE[i % PALETTE.length]));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Árboles en la vereda de enfrente.
    const treePos = Array.from({ length: 12 }, (_, i) => new THREE.Vector3(-30 + i * 5.4, -0.3, 14.2));
    const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ color: '#7a6450' }), treePos.length);
    const canopyMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshStandardMaterial({ color: '#7f9a69', roughness: 0.9, flatShading: true }), treePos.length);
    treePos.forEach((p, i) => {
      trunkMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
      const s = 0.9 + rnd() * 0.4;
      canopyMesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y + 3.4, p.z), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.1, s)));
    });
    trunkMesh.castShadow = canopyMesh.castShadow = true;
    return { buildings: mesh, trunks: trunkMesh, canopies: canopyMesh };
  }, []);

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.32, -5]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial color="#cdc9be" roughness={1} />
      </mesh>
      {/* Vereda de enfrente. */}
      <mesh position={[0, -0.2, 14.6]} receiveShadow>
        <boxGeometry args={[80, 0.24, 5]} />
        <meshStandardMaterial color="#b9b5ab" roughness={0.9} />
      </mesh>
      <primitive object={buildings} />
      <primitive object={trunks} />
      <primitive object={canopies} />
    </>
  );
}
