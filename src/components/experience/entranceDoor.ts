import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { buildCollider } from './collision';

// Puerta automática del acceso al edificio: dos hojas de vidrio corredizas, con marco de aluminio,
// que se abren cuando el visitante se acerca. En el modelo el acceso tiene dos hojas fijas abiertas
// a 90°; se recortan al cargar para no regenerar el GLB.

/** Vano entre los parantes de aluminio del acceso (coordenadas de la escena). */
const VANO = { x: 0.15, z: -0.1, width: 2.63, height: 2.6, top: 4.21 };
const NEAR = 3; // distancia a la que se abre
const SECONDS = 1;
const FRAME = 0.05;
const DEPTH = 0.04;

export interface EntranceDoor {
  leaves: { mesh: THREE.Object3D; collider: MeshBVH }[];
  /** Avanza la animación según la posición del visitante (ojos). */
  update: (eye: THREE.Vector3, dt: number) => void;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Quita del vidrio del hall las dos hojas abiertas del modelo (los triángulos que caen en sus cajas). */
export function removeOpenLeaves(mesh: THREE.Mesh) {
  const leaves = [-1.15, 1.45].map((x) => new THREE.Box3(new THREE.Vector3(x - 0.05, -0.05, -1.55), new THREE.Vector3(x + 0.05, 2.65, -0.05)));
  const geometry = mesh.geometry.clone(); // la original es del caché de useGLTF
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const index = geometry.index;
  if (!index) return;
  mesh.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  const inLeaf = (i: number) => {
    v.fromBufferAttribute(position, index.getX(i)).applyMatrix4(mesh.matrixWorld);
    return leaves.some((b) => b.containsPoint(v));
  };
  const kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    if (inLeaf(i) && inLeaf(i + 1) && inLeaf(i + 2)) continue;
    kept.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  geometry.setIndex(kept);
  mesh.geometry = geometry;
}

export function buildEntranceDoor(scene: THREE.Object3D, glass: THREE.Material, aluminum: THREE.Material): EntranceDoor {
  const half = VANO.width / 2;
  const leafWidth = half + 0.02; // cerrada pisa apenas el parante
  const leafZ = VANO.z - 0.02 - DEPTH / 2; // del lado del hall, detrás del vidrio fijo

  // Las piezas móviles no proyectan sombra: el mapa de sombras es estático.
  const box = (parent: THREE.Object3D, material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Riel y paño fijo sobre las hojas, hasta el dintel del acceso.
  box(scene, aluminum, VANO.width, 0.08, 0.1, VANO.x, VANO.height + 0.04, leafZ);
  box(scene, glass, VANO.width, VANO.top - VANO.height - 0.08, 0.012, VANO.x, (VANO.height + 0.08 + VANO.top) / 2, VANO.z);

  const leaves = [-1, 1].map((side) => {
    const leaf = new THREE.Group();
    leaf.position.set(VANO.x, VANO.height / 2, leafZ);
    scene.add(leaf);
    box(leaf, glass, leafWidth - FRAME, VANO.height - FRAME, 0.012, 0, 0);
    for (const x of [-1, 1]) box(leaf, aluminum, FRAME, VANO.height, DEPTH, x * (leafWidth - FRAME) / 2, 0);
    for (const y of [-1, 1]) box(leaf, aluminum, leafWidth - FRAME, y < 0 ? 0.12 : FRAME, DEPTH, 0, y * (VANO.height / 2 - (y < 0 ? 0.06 : FRAME / 2)));
    // Tirador vertical en el canto que cierra, a ambos lados del vidrio.
    for (const z of [-1, 1]) box(leaf, aluminum, 0.025, 0.9, 0.025, -side * (leafWidth / 2 - 0.12), 0.05, z * (DEPTH / 2 + 0.03));
    const collider = buildCollider([], [new THREE.BoxGeometry(leafWidth, VANO.height, DEPTH)]);
    return { side, mesh: leaf, collider };
  });

  let open = 0;
  const set = () => {
    const offset = leafWidth / 2 + ease(open) * half;
    for (const { side, mesh } of leaves) mesh.position.x = VANO.x + side * offset;
  };
  set();

  return {
    leaves,
    update: (eye, dt) => {
      const near = eye.y < VANO.top + 2 && Math.hypot(eye.x - VANO.x, eye.z - VANO.z) < NEAR;
      const next = THREE.MathUtils.clamp(open + (near ? dt : -dt) / SECONDS, 0, 1);
      if (next === open) return;
      open = next;
      set();
    },
  };
}
