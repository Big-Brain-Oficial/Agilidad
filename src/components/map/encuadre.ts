// Proyección de la cámara de MapLibre (Mercator con perspectiva), para calcular encuadres
// sin mover el mapa. MapLibre 6 no expone su transformación interna; esta es la misma cuenta:
// la cámara mira al centro desde (alto / 2) / tan(fov / 2) píxeles, inclinada `pitch` grados.

export interface Camara {
  centro: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  /** Campo de visión vertical en grados (`map.getVerticalFieldOfView()`). */
  fov: number;
  ancho: number;
  alto: number;
}

const TESELA = 512;
const CIRCUNFERENCIA = 40075016.686;
const rad = (grados: number) => (grados * Math.PI) / 180;

function aMundo([longitud, latitud]: [number, number], mundo: number) {
  return {
    x: ((longitud + 180) / 360) * mundo,
    y: ((180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + rad(latitud) / 2))) / 360) * mundo,
  };
}

function desdeMundo(x: number, y: number, mundo: number): [number, number] {
  const longitud = (x / mundo) * 360 - 180;
  const latitud = (360 / Math.PI) * Math.atan(Math.exp(rad(180 - (y / mundo) * 360))) - 90;
  return [longitud, latitud];
}

/** Punto en pantalla (px desde la esquina superior izquierda) de un lugar a `metros` de altura. */
export function proyectar(c: Camara, lugar: [number, number], metros = 0) {
  const mundo = TESELA * 2 ** c.zoom;
  const p = aMundo(lugar, mundo);
  const o = aMundo(c.centro, mundo);
  const b = rad(c.bearing);
  const pitch = rad(c.pitch);
  // Al plano de la pantalla: u hacia la derecha, v hacia abajo (hacia quien mira).
  const u = (p.x - o.x) * Math.cos(b) + (p.y - o.y) * Math.sin(b);
  const v = -(p.x - o.x) * Math.sin(b) + (p.y - o.y) * Math.cos(b);
  const h = metros / ((CIRCUNFERENCIA * Math.cos(rad(c.centro[1]))) / mundo);
  const distancia = c.alto / 2 / Math.tan(rad(c.fov) / 2);
  const profundidad = distancia - v * Math.sin(pitch) - h * Math.cos(pitch);
  return {
    x: c.ancho / 2 + (u * distancia) / profundidad,
    y: c.alto / 2 + ((v * Math.cos(pitch) - h * Math.sin(pitch)) * distancia) / profundidad,
  };
}

/** Mueve el centro para que lo que está en pantalla en (dx, dy) respecto del centro pase al centro. */
export function desplazarCentro(c: Camara, dx: number, dy: number): [number, number] {
  const mundo = TESELA * 2 ** c.zoom;
  const o = aMundo(c.centro, mundo);
  const b = rad(c.bearing);
  // Aproximación lineal en el centro de la pantalla; quien la usa itera para corregir la perspectiva.
  const u = dx;
  const v = dy / Math.cos(rad(c.pitch));
  return desdeMundo(o.x + u * Math.cos(b) - v * Math.sin(b), o.y + u * Math.sin(b) + v * Math.cos(b), mundo);
}
