import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import type { ZonaId } from '@/content/recorridos';
import { buildCabinDoors, type CabinDoors } from './cabinDoors';
import { buildCollider, wallGeometry } from './collision';
import { buildEntranceDoor, removeOpenLeaves, type EntranceDoor } from './entranceDoor';

// Convierte el GLB exportado por scripts/blender/export_web.py en los datos que usa la experiencia.
// Convenciones de nombres del GLB:
//   COL__<zona>__<material>  malla que participa de las colisiones
//   VIS__<zona>__<material>  malla solo visual (VIS__ascensor__* es la cabina móvil)
//   ANCLA__*  puntos clave · ZONA__* cajas de zona (escala = medio tamaño) · LUZ__* luces de Blender
//   ANCLA__ascensor__<n> y ZONA__ascensor__<n>  cabina y hueco de cada parada (0 = hall)

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
  doors: CabinDoors;
  entrance: EntranceDoor | null;
  /**
   * Paradas del ascensor (0 = hall). Cada una tiene su hueco: `cabin` es la posición del grupo de la
   * cabina en esa parada (el modelo la trae en la 0).
   */
  stops: { cabin: THREE.Vector3; shaft: THREE.Box3 }[];
  /** Altura de la cabina a la que pasa del hueco del hall al del departamento, con las puertas cerradas. */
  transfer: number;
  pisoDepto: number;
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
  const cabinBounds = new THREE.Box3();
  for (const m of cabinMeshes) {
    cabinBounds.expandByObject(m);
    cabin.attach(m);
  }
  // Las puertas usan el mismo acero de la cabina: no suman shaders para compilar.
  const steel = cabinMeshes.find((m) => !m.name.includes('LED'))!.material;
  const doors = buildCabinDoors(cabin, cabinBounds, Array.isArray(steel) ? steel[0] : steel);

  // Puerta automática del acceso: reemplaza las hojas fijas abiertas del modelo.
  const hallGlass = scene.getObjectByName('COL__hall__Vidrio_claro');
  const hallAluminum = scene.getObjectByName('COL__hall__AV_Aluminio');
  let entrance: EntranceDoor | null = null;
  if (hallGlass instanceof THREE.Mesh && hallAluminum instanceof THREE.Mesh) {
    removeOpenLeaves(hallGlass);
    entrance = buildEntranceDoor(scene, hallGlass.material as THREE.Material, hallAluminum.material as THREE.Material);
  }

  const bus = worldPos(named('ANCLA__bus'));
  const busDoor = bus.clone().add(BUS_DOOR);

  // Paredes invisibles en el borde de lo transitable (calle, vereda y terreno del edificio).
  const walls = [
    [-32.5, 12, 32.5, 12], [-32.5, 2, -32.5, 12], [32.5, 2, 32.5, 12], [-32.5, 2, -13.5, 2], [13.5, 2, 32.5, 2],
    [-13.5, 0, -13.5, 2], [13.5, 0, 13.5, 2], [-13.5, 0, -12, 0], [12, 0, 13.5, 0], [-12, -18.5, -12, 0],
    [12, -18.5, 12, 0], [-12, -18.5, 12, -18.5],
  ].map(([x1, z1, x2, z2]) => wallGeometry(x1, z1, x2, z2));
  const busBox = new THREE.BoxGeometry(BUS.length, BUS.height, BUS.width).translate(bus.x, bus.y + BUS.height / 2, bus.z);

  const stops: WorldData['stops'] = [];
  for (let i = 0; ; i++) {
    const cabinAnchor = scene.getObjectByName(`ANCLA__ascensor__${i}`);
    const shaft = scene.getObjectByName(`ZONA__ascensor__${i}`);
    if (!cabinAnchor || !shaft) break;
    stops.push({ cabin: worldPos(cabinAnchor), shaft: boxOf(shaft) });
  }
  if (!stops.length) throw new Error('El modelo no tiene paradas de ascensor');
  const modeled = stops[0].cabin.clone();
  for (const stop of stops) stop.cabin.sub(modeled);

  // Orden de prioridad: los huecos primero, y el pasillo antes que la caja del departamento, que lo
  // toca en la puerta de entrada.
  const zones: { id: ZonaId; box: THREE.Box3 }[] = stops.map((s) => ({ id: 'ascensor', box: s.shaft }));
  for (const id of ['pasillo', 'depto', 'hall'] as const) {
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

  const elevatorData = elevator.userData as { transbordo?: number; piso_depto?: number };
  const views: WorldData['views'] = [];
  scene.traverse((o) => {
    if (!o.name.startsWith('VISTA__')) return;
    views.push({ id: o.name.slice(7), label: String(o.userData.label), position: worldPos(o), target: fromBlender(o.userData.target) });
  });
  views.push({ id: 'exterior', label: 'Acceso al edificio', position: worldPos(named('ANCLA__inicio')), target: worldPos(named('ANCLA__acceso')) });
  // La llegada siempre comienza en la vereda, mirando al acceso del edificio.
  const initialLevel = 0;
  cabin.position.copy(stops[initialLevel].cabin);

  return {
    collider: buildCollider(colliders, [...walls, busBox]),
    spawn: worldPos(named('ANCLA__inicio')),
    lookAt: worldPos(named('ANCLA__acceso')),
    bus,
    busDoor,
    cabin,
    doors,
    entrance,
    stops,
    transfer: elevatorData.transbordo ?? Infinity,
    pisoDepto: elevatorData.piso_depto ?? 0,
    zones,
    lights,
    views,
    initialLevel,
  };
}
