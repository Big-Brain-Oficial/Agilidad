import * as THREE from 'three';
import { MeshBVH, type ExtendedTriangle } from 'three-mesh-bvh';

// Colisiones del visitante: una cápsula contra un BVH (árbol de volúmenes) de la geometría del modelo.
// Basado en el ejemplo "characterMovement" de three-mesh-bvh.

/** Une las mallas indicadas en una sola geometría en coordenadas de mundo y le construye un BVH. */
export function buildCollider(meshes: THREE.Mesh[], extra: THREE.BufferGeometry[] = []): MeshBVH {
  const sources: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = meshes.map((m) => {
    m.updateWorldMatrix(true, false);
    return { geometry: m.geometry, matrix: m.matrixWorld };
  });
  for (const g of extra) sources.push({ geometry: g, matrix: new THREE.Matrix4() });

  let count = 0;
  for (const { geometry } of sources) count += geometry.index ? geometry.index.count : geometry.attributes.position.count;

  // Se leen los vértices con fromBufferAttribute: soporta atributos cuantizados (meshopt) e intercalados.
  const positions = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  let o = 0;
  for (const { geometry, matrix } of sources) {
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const index = geometry.index;
    const n = index ? index.count : pos.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(matrix);
      positions[o++] = v.x;
      positions[o++] = v.y;
      positions[o++] = v.z;
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new MeshBVH(merged);
}

/** Caja delgada (pared invisible) entre dos puntos del piso. */
export function wallGeometry(x1: number, z1: number, x2: number, z2: number, height = 4, thickness = 0.3): THREE.BufferGeometry {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const g = new THREE.BoxGeometry(len, height, thickness);
  g.rotateY(-Math.atan2(z2 - z1, x2 - x1));
  g.translate((x1 + x2) / 2, height / 2 - 0.5, (z1 + z2) / 2);
  return g;
}

const box = new THREE.Box3();
const segment = new THREE.Line3();
const triPoint = new THREE.Vector3();
const capsulePoint = new THREE.Vector3();

/**
 * Empuja una cápsula (segmento + radio, en coordenadas de mundo) fuera de los triángulos que la intersecan.
 * Devuelve en `out` el desplazamiento aplicado al punto `start` del segmento.
 */
export function resolveCapsule(bvh: MeshBVH, start: THREE.Vector3, end: THREE.Vector3, radius: number, out: THREE.Vector3) {
  segment.start.copy(start);
  segment.end.copy(end);
  box.makeEmpty();
  box.expandByPoint(segment.start);
  box.expandByPoint(segment.end);
  box.min.addScalar(-radius);
  box.max.addScalar(radius);

  bvh.shapecast({
    intersectsBounds: (b) => b.intersectsBox(box),
    intersectsTriangle: (tri: ExtendedTriangle) => {
      const distance = tri.closestPointToSegment(segment, triPoint, capsulePoint);
      if (distance < radius) {
        const depth = radius - distance;
        const direction = capsulePoint.sub(triPoint).normalize();
        segment.start.addScaledVector(direction, depth);
        segment.end.addScaledVector(direction, depth);
      }
    },
  });

  return out.subVectors(segment.start, start);
}
