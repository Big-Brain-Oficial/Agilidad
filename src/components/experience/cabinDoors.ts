import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { buildCollider } from './collision';

// Puertas corredizas de la cabina, armadas en código sobre la cabina abierta del modelo.
// La cabina se abre hacia +z (el hall y el pasillo). Su frente lleva dos paños fijos a los
// costados, un dintel y dos hojas de apertura central que se guardan detrás de los paños fijos.

/** Altura del piso de la cabina respecto de su origen. */
export const CABIN_FLOOR = 0.08;
const OPENING = 1; // ancho libre de paso con las puertas abiertas
const DOOR_HEIGHT = 2.1; // sobre el piso de la cabina
const FRONT_DEPTH = 0.04;
const LEAF_DEPTH = 0.03;

export interface CabinDoors {
  /** 0 = abiertas, 1 = cerradas. */
  set: (closed: number) => void;
  /** Paños fijos del frente, en coordenadas de la cabina (se mueven con ella). */
  collider: MeshBVH;
  /** Z hasta la que se corre el visitante para que las puertas no lo dejen afuera. */
  inside: number;
}

/** Arma las puertas dentro del grupo de la cabina. `bounds` es la caja de la cabina en su posición local. */
export function buildCabinDoors(cabin: THREE.Group, bounds: THREE.Box3, material: THREE.Material): CabinDoors {
  const floor = bounds.min.y + CABIN_FLOOR;
  const front = bounds.max.z;
  const half = (bounds.max.x - bounds.min.x) / 2;
  const cx = (bounds.max.x + bounds.min.x) / 2;
  const top = bounds.max.y - 0.1; // debajo del techo de la cabina
  const sideWidth = half - OPENING / 2;
  const leafWidth = OPENING / 2 + 0.01; // cerradas cubren apenas el borde de los paños fijos

  // Acero cepillado: el pulido de la cabina, tan cerca de la luz del techo, se ve como un reflejo quemado.
  const brushed = material.clone() as THREE.MeshStandardMaterial;
  brushed.roughness = 0.5;
  const rubber = new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.9 });

  const box = (w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D = cabin, mat: THREE.Material = brushed) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Frente fijo: paños laterales de piso a techo y dintel sobre las puertas.
  const frontZ = front - FRONT_DEPTH / 2;
  const fixed = [-1, 1].map((side) =>
    box(sideWidth, top - floor, FRONT_DEPTH, cx + side * (OPENING / 2 + sideWidth / 2), (floor + top) / 2, frontZ));
  box(OPENING, top - floor - DOOR_HEIGHT, FRONT_DEPTH, cx, (floor + DOOR_HEIGHT + top) / 2, frontZ);

  // Hojas: por detrás del frente, del lado de adentro.
  const leafZ = front - FRONT_DEPTH - 0.01 - LEAF_DEPTH / 2;
  const leaves = [-1, 1].map((side) => {
    const mesh = box(leafWidth, DOOR_HEIGHT, LEAF_DEPTH, 0, floor + DOOR_HEIGHT / 2, leafZ);
    // Burlete en el canto que cierra: marca la junta entre las dos hojas.
    box(0.012, DOOR_HEIGHT, LEAF_DEPTH + 0.004, -side * (leafWidth / 2 - 0.006), 0, 0, mesh, rubber);
    return { side, mesh };
  });
  const set = (closed: number) => {
    // Cerradas se tocan en el centro; abiertas quedan ocultas detrás de los paños fijos.
    const offset = leafWidth / 2 + (1 - closed) * (OPENING / 2);
    for (const { side, mesh } of leaves) mesh.position.x = cx + side * offset;
  };
  set(0);

  return {
    set,
    collider: buildCollider([], fixed.map((m) => m.geometry.clone().translate(m.position.x, m.position.y, m.position.z))),
    inside: leafZ - LEAF_DEPTH / 2 - 0.3,
  };
}
