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
  views: { id: string; label: string; position: THREE.Vector3; target: THREE.Vector3 }[];
  initialLevel: number;
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
  const materials = new Map<THREE.Material, THREE.Material>();
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
    if (o.name.startsWith('PHY__')) {
      o.visible = false;
      colliders.push(o);
      return;
    }
    const cloneMaterial = (source: THREE.Material) => {
      if (!materials.has(source)) materials.set(source, source.clone());
      return materials.get(source)!;
    };
    o.material = Array.isArray(o.material) ? o.material.map(cloneMaterial) : cloneMaterial(o.material);
    const list = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.MeshStandardMaterial[];
    let isGlass = false;
    for (const material of list) {
    const glass = GLASS[material.name];
    const physicalGlass = material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0;
    isGlass ||= !!glass || physicalGlass;
    if (glass) {
      material.transparent = true;
      material.opacity = glass.opacity;
      material.depthWrite = false;
      material.side = THREE.DoubleSide;
      material.roughness = 0.08;
      if (glass.color) material.color.set(glass.color);
    }
    material.envMapIntensity = physicalGlass ? 1 : 0.8;
    // Los metales conservan su respuesta física con IBL. Los mapas de datos permanecen lineales.
    for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) {
      if (texture) texture.anisotropy = 8;
    }
    }
    o.castShadow = !isGlass;
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
  const levels = elevatorData.niveles ?? [0];
  const views: WorldData['views'] = [];
  scene.traverse((o) => {
    if (!o.name.startsWith('VISTA__')) return;
    views.push({ id: o.name.slice(7), label: String(o.userData.label), position: worldPos(o), target: fromBlender(o.userData.target) });
  });
  views.push({ id: 'exterior', label: 'Acceso al edificio', position: worldPos(named('ANCLA__inicio')), target: worldPos(named('ANCLA__acceso')) });
  // La llegada siempre comienza en la vereda, mirando al acceso del edificio.
  const initialLevel = 0;
  cabin.position.y = levels[initialLevel];

  return {
    collider: buildCollider(colliders, [...walls, busBox]),
    spawn: worldPos(named('ANCLA__inicio')),
    lookAt: worldPos(named('ANCLA__acceso')),
    bus,
    busDoor,
    cabin,
    levels,
    pisoDepto: elevatorData.piso_depto ?? 0,
    shaft: zones.find((z) => z.id === 'ascensor')?.box ?? new THREE.Box3(),
    zones,
    lights,
    views,
    initialLevel,
  };
}
