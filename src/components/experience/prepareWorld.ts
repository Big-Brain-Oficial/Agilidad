import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import type { ZonaId } from '@/content/recorridos';
import { buildCollider, wallGeometry } from './collision';

// Convierte el GLB exportado por scripts/blender/export_web.py en los datos que usa la experiencia.
// Convenciones de nombres del GLB:
//   COL__<zona>__<material>  malla que participa de las colisiones
//   VIS__<zona>__<material>  malla solo visual (VIS__ascensor__* es la cabina móvil)
//   ANCLA__*  puntos clave · ZONA__* cajas de zona (escala = medio tamaño) · LUZ__* luces de Blender

export const BUS = { length: 11.5, width: 2.55, height: 3.35 };
/** Puerta del bus respecto de su ancla: cerca del frente, del lado de la vereda (-z). */
export const BUS_DOOR = new THREE.Vector3(3.6, 0, -1.3);

export interface LightAnchor {
  position: THREE.Vector3;
  tipo: string;
  energia: number;
  direccion: THREE.Vector3;
  enCabina: boolean;
}

export interface WorldData {
  collider: MeshBVH;
  spawn: THREE.Vector3;
  lookAt: THREE.Vector3;
  bus: THREE.Vector3;
  busDoor: THREE.Vector3;
  cabin: THREE.Group;
  /** Alturas del piso de cada parada del ascensor (0 = hall). */
  levels: number[];
  pisoDepto: number;
  shaft: THREE.Box3;
  zones: { id: ZonaId; box: THREE.Box3 }[];
  lights: LightAnchor[];
}

const GLASS: Record<string, { opacity: number; color?: string }> = {
  'Vidrio claro': { opacity: 0.16, color: '#cfe3ea' },
  'Vidrio fachada azul gris': { opacity: 0.55 },
};

const fromBlender = (v: number[]) => new THREE.Vector3(v[0], v[2], -v[1]);

export function prepareWorld(scene: THREE.Object3D): WorldData {
  scene.updateMatrixWorld(true);
  const colliders: THREE.Mesh[] = [];
  const cabinMeshes: THREE.Mesh[] = [];
  const named = (name: string) => {
    const o = scene.getObjectByName(name);
    if (!o) throw new Error(`El modelo no tiene el ancla ${name}`);
    return o;
  };
  const worldPos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const boxOf = (o: THREE.Object3D) => {
    const c = worldPos(o), s = o.getWorldScale(new THREE.Vector3());
    return new THREE.Box3(c.clone().sub(s), c.clone().add(s));
  };

  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const material = o.material as THREE.MeshStandardMaterial;
    const glass = GLASS[material.name];
    if (glass) {
      material.transparent = true;
      material.opacity = glass.opacity;
      material.depthWrite = false;
      material.side = THREE.DoubleSide;
      material.roughness = 0.08;
      if (glass.color) material.color.set(glass.color);
    }
    // Sin mapa de entorno, los metales muy reflectivos se verían negros: se moderan.
    material.metalness = Math.min(material.metalness, 0.25);
    o.castShadow = !glass;
    o.receiveShadow = true;
    if (o.name.startsWith('COL__')) colliders.push(o);
    if (o.name.startsWith('VIS__ascensor')) cabinMeshes.push(o);
  });

  // La cabina se mueve en un grupo propio; su piso lo resuelve el control del visitante.
  const elevator = named('ANCLA__ascensor');
  const cabin = new THREE.Group();
  cabin.name = 'cabina';
  scene.add(cabin);
  for (const m of cabinMeshes) cabin.attach(m);

  const bus = worldPos(named('ANCLA__bus'));
  const busDoor = bus.clone().add(BUS_DOOR);

  // Paredes invisibles en el borde de lo transitable (calle, vereda y terreno del edificio).
  const walls = [
    [-32.5, 12, 32.5, 12], [-32.5, 2, -32.5, 12], [32.5, 2, 32.5, 12], [-32.5, 2, -13.5, 2], [13.5, 2, 32.5, 2],
    [-13.5, 0, -13.5, 2], [13.5, 0, 13.5, 2], [-13.5, 0, -12, 0], [12, 0, 13.5, 0], [-12, -18.5, -12, 0],
    [12, -18.5, 12, 0], [-12, -18.5, 12, -18.5],
  ].map(([x1, z1, x2, z2]) => wallGeometry(x1, z1, x2, z2));
  const busBox = new THREE.BoxGeometry(BUS.length, BUS.height, BUS.width).translate(bus.x, bus.y + BUS.height / 2, bus.z);

  const zones: { id: ZonaId; box: THREE.Box3 }[] = [];
  // Orden de prioridad: la caja del departamento envuelve también al palier.
  for (const id of ['ascensor', 'palier', 'depto', 'hall'] as const) {
    const o = scene.getObjectByName(`ZONA__${id}`);
    if (o) zones.push({ id, box: boxOf(o) });
  }

  const lights: LightAnchor[] = [];
  scene.traverse((o) => {
    if (!o.name.startsWith('LUZ__')) return;
    const u = o.userData as { tipo?: string; energia?: number; direccion?: number[] };
    lights.push({
      position: worldPos(o),
      tipo: u.tipo ?? 'AREA',
      energia: u.energia ?? 100,
      direccion: fromBlender(u.direccion ?? [0, 0, -1]).normalize(),
      enCabina: o.name.includes('ascensor'),
    });
  });

  const elevatorData = elevator.userData as { niveles?: number[]; piso_depto?: number };

  return {
    collider: buildCollider(colliders, [...walls, busBox]),
    spawn: worldPos(named('ANCLA__inicio')),
    lookAt: worldPos(named('ANCLA__acceso')),
    bus,
    busDoor,
    cabin,
    levels: elevatorData.niveles ?? [0],
    pisoDepto: elevatorData.piso_depto ?? 0,
    shaft: zones.find((z) => z.id === 'ascensor')?.box ?? new THREE.Box3(),
    zones,
    lights,
  };
}
