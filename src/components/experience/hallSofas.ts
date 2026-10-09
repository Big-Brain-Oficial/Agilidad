import * as THREE from 'three';

// En el modelo los dos sillones del hall miran a las paredes laterales: el giro de Blender tiene
// el signo cambiado. Ya está corregido en los scripts de Blender; mientras no se regenere el GLB,
// se dan vuelta al cargar. Cuando el GLB venga corregido esto no hace nada y se puede borrar.

/** Centro de cada sillón y su caja, en coordenadas de la escena. La caja tiene margen: si corta un almohadón, se estira. */
const SOFAS = [
  { x: 2.44, z: -3.8, halfWidth: 1.35 },
  { x: -2.28, z: -3.55, halfWidth: 0.8 },
].map(({ x, z, halfWidth }) => ({
  center: new THREE.Vector3(x, 0, z),
  box: new THREE.Box3(new THREE.Vector3(x - 0.6, -0.05, z - halfWidth), new THREE.Vector3(x + 0.6, 1.3, z + halfWidth)),
}));
const BACKREST = 1; // solo el respaldo pasa esta altura

/** Gira 180° el tapizado de cada sillón que tenga el respaldo del lado del hall. Las patas son simétricas. */
export function turnHallSofas(scene: THREE.Object3D) {
  const meshes = ['VIS__hall__AV_Tela_oliva', 'VIS__hall__AV_Tela_marfil']
    .map((name) => scene.getObjectByName(name))
    .filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
  const oliva = meshes[0];
  if (!oliva) return;
  oliva.updateWorldMatrix(true, false);

  const v = new THREE.Vector3();
  const turned = SOFAS.filter(({ center, box }) => {
    // Mira al hall si el respaldo queda del lado de la pared (más lejos del centro del hall).
    const position = oliva.geometry.attributes.position;
    let sum = 0, n = 0;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(oliva.matrixWorld);
      if (v.y > BACKREST && box.containsPoint(v)) {
        sum += v.x;
        n++;
      }
    }
    return n > 0 && Math.sign(sum / n - center.x) !== Math.sign(center.x);
  });
  if (!turned.length) return;

  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const toWorld = mesh.matrixWorld;
    const toLocal = toWorld.clone().invert();
    // La geometría original es del caché de useGLTF. Las posiciones vienen cuantizadas a la caja
    // de la malla: se pasan a Float32 para que el sillón girado no quede recortado contra ella.
    const geometry = mesh.geometry.clone();
    const attributes = (['position', 'normal', 'tangent'] as const).flatMap((name) => {
      const source = geometry.attributes[name] as THREE.BufferAttribute | undefined;
      if (!source) return [];
      const copy = new THREE.Float32BufferAttribute(source.count * source.itemSize, source.itemSize);
      for (let i = 0; i < source.count; i++) {
        for (let k = 0; k < source.itemSize; k++) copy.setComponent(i, k, source.getComponent(i, k));
      }
      geometry.setAttribute(name, copy);
      return [{ name, attribute: copy }];
    });
    const position = geometry.attributes.position;

    for (const { center, box } of turned) {
      // Media vuelta sobre el eje vertical del sillón, expresada en las coordenadas de la malla.
      const turn = new THREE.Matrix4()
        .makeTranslation(center.x, 0, center.z)
        .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
        .multiply(new THREE.Matrix4().makeTranslation(-center.x, 0, -center.z));
      const local = toLocal.clone().multiply(turn).multiply(toWorld);
      const directions = new THREE.Matrix3().setFromMatrix4(local);
      for (let i = 0; i < position.count; i++) {
        if (!box.containsPoint(v.fromBufferAttribute(position, i).applyMatrix4(toWorld))) continue;
        for (const { name, attribute } of attributes) {
          v.fromBufferAttribute(attribute, i);
          if (name === 'position') v.applyMatrix4(local);
          else v.applyMatrix3(directions).normalize();
          attribute.setXYZ(i, v.x, v.y, v.z); // la tangente conserva su w
        }
      }
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    mesh.geometry = geometry;
  }
}
