import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import type { Desarrollo } from './desarrollos';

// Dirección: https://estudiomarq.com.ar/torre-natalini/
// Huella de la esquina: https://www.openstreetmap.org/way/1102375879
// Verificación del domicilio: Nominatim, Formosa 485, Resistencia (08/10/2026).
// OSM todavía etiqueta esta huella como obra; la ubicación se contrasta con el domicilio de MARQ.
export const NATALINI_CENTRO: [number, number] = [-58.988587, -27.4418294];

const HUELLA: [number, number][] = [
  [-58.9887004, -27.4418282],
  [-58.9885817, -27.4419299],
  [-58.9884736, -27.4418306],
  [-58.9885923, -27.4417289],
  [-58.9887004, -27.4418282],
];

// Pueblo Mío (Puerto Tirol) queda a unos 12 km del centro: sumarlo a la vista general
// achica tanto el mapa que las torres del centro se amontonan. Se llega desde la lista.
export const FUERA_DE_VISTA_GENERAL = new Set(['pueblo-mio']);

// ---- Escala de las maquetas --------------------------------------------------------
//
// Las maquetas usan una escala gráfica que cambia con el zoom: de lejos crecen para seguir
// leyéndose sobre la ciudad y, desde ZOOM_ESCALA_BASE, quedan con su tamaño de referencia.

const ZOOM_ESCALA_BASE = 17;
// Metros por píxel en el zoom 0 a la latitud de Resistencia (teselas de 512 px).
const METROS_POR_PIXEL_Z0 = (40075016.686 * Math.cos((27.44 * Math.PI) / 180)) / 512;

export interface EscalaMaqueta {
  /** Factor del ancho y fondo de todas las maquetas. */
  planta: number;
  /** Factor de la altura de las torres. Barrios y casas crecen parejo con `planta`. */
  altura: number;
  /** Metros por píxel de pantalla en ese zoom: fija el grosor mínimo de las losas. */
  pixel: number;
}

export function escalaMaqueta(zoom: number): EscalaMaqueta {
  // Pasos de 0,05 de zoom: el cambio no se nota y el GeoJSON se regenera pocas veces.
  const z = Math.round(zoom * 20) / 20;
  const lejania = Math.max(0, ZOOM_ESCALA_BASE - z);
  return {
    // La planta crece menos que la altura y tiene tope: UNO Boulevard y NBCH están a ~290 m
    // y sus maquetas no deben tocarse ni en el zoom mínimo.
    planta: Math.min(2 ** (0.55 * lejania), 5),
    altura: 2 ** (0.8 * lejania),
    pixel: METROS_POR_PIXEL_Z0 / 2 ** z,
  };
}

const ESCALA_BASE = escalaMaqueta(ZOOM_ESCALA_BASE);

// Metros en un plano local, girado 45° como las maquetas.
function desplazar([longitud, latitud]: [number, number], x: number, y: number): [number, number] {
  const angulo = -Math.PI / 4;
  const lonPorMetro = 1 / (111320 * Math.cos((latitud * Math.PI) / 180));
  const latPorMetro = 1 / 111320;
  return [
    longitud + (x * Math.cos(angulo) - y * Math.sin(angulo)) * lonPorMetro,
    latitud + (x * Math.sin(angulo) + y * Math.cos(angulo)) * latPorMetro,
  ];
}

// Casas BDN comparte el domicilio de Brisas del Norte: su conjunto se dibuja al lado, sin pisarlo.
const DESPLAZAMIENTO_CASAS = 115;

/** Punto de apoyo de la maqueta: donde nace la tarjeta del mapa. */
export function centroMaqueta(d: Desarrollo, e: EscalaMaqueta = ESCALA_BASE): [number, number] | null {
  if (!d.ubicacion) return null;
  const punto: [number, number] = [d.ubicacion.longitud, d.ubicacion.latitud];
  return d.tipo === 'casas' ? desplazar(punto, DESPLAZAMIENTO_CASAS * e.planta, 0) : punto;
}

const ALTURA_EDIFICIO: Record<string, number> = { 'uno-boulevard': 48, 'torre-panorama': 115 };

/**
 * Tamaño aproximado de la maqueta: ancho y alto en pantalla (px) y altura en metros del mapa.
 * Sirve para que las tarjetas no tapen otras torres y para el encuadre de la vista general.
 */
export function siluetaMaqueta(d: Desarrollo, zoom: number, pitchGrados: number): { ancho: number; alto: number; metros: number } {
  const e = escalaMaqueta(zoom);
  const pitch = (pitchGrados * Math.PI) / 180;
  const torre = d.tipo === 'edificio';
  const planta = (torre ? 40 : 125) * e.planta;
  const metros = torre ? (d.id === 'torre-natalini' ? 105 : (ALTURA_EDIFICIO[d.id] ?? 78) + 4) * e.altura : 13 * e.planta;
  return {
    ancho: planta / e.pixel,
    alto: (metros * Math.sin(pitch) + (planta / 2) * Math.cos(pitch)) / e.pixel,
    metros,
  };
}

// Losas claras cada `paso` metros. De lejos se espacian y engrosan para que sigan siendo
// líneas nítidas en pantalla en lugar de un rayado que titila al mover el mapa.
function losas(desde: number, hasta: number, paso: number, grosor: number, vertical: number, e: EscalaMaqueta, dibujar: (base: number, tope: number) => void) {
  const salto = Math.max(1, Math.ceil((9 * e.pixel) / (paso * vertical)));
  const espesor = Math.max(grosor * vertical, 1.6 * e.pixel);
  for (let h = desde; h <= hasta; h += paso * salto) dibujar(h * vertical - espesor, h * vertical);
}

// Representación cartográfica independiente del GLB y del recorrido inmersivo.
// Los 26 niveles salen del catálogo; dimensiones y retranqueo son orientativos.
// La escala visual destaca MARQ en la maqueta y no expresa dimensiones de obra.
export function volumenNatalini(e: EscalaMaqueta = ESCALA_BASE): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = [];
  const vertical = 1.3 * e.altura;
  const planta = (escala: number) => HUELLA.map(([lon, lat]) => [
    NATALINI_CENTRO[0] + (lon - NATALINI_CENTRO[0]) * escala * 1.5 * e.planta,
    NATALINI_CENTRO[1] + (lat - NATALINI_CENTRO[1]) * escala * 1.5 * e.planta,
  ]);
  const agregar = (escala: number, base: number, altura: number, color: string) => {
    features.push({
      type: 'Feature',
      properties: { desarrollo: 'torre-natalini', base, altura, color },
      geometry: { type: 'Polygon', coordinates: [planta(escala)] },
    });
  };

  agregar(1, 0, 4 * vertical, '#bb985c');
  agregar(0.87, 4 * vertical, 78 * vertical, '#d7b277');
  // Losas claras: dan lectura de los pisos sin cargar un modelo arquitectónico.
  losas(6, 78, 3, 0.25, vertical, e, (base, tope) => agregar(0.96, base, tope, '#fffbef'));
  agregar(0.68, 78 * vertical, 81 * vertical, '#fff0cb');
  return { type: 'FeatureCollection', features };
}

/** Maquetas orientativas: no reproducen planos ni sustituyen los recorridos 360. */
export function volumenesMarq(desarrollos: Desarrollo[], e: EscalaMaqueta = ESCALA_BASE): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = [];
  for (const d of desarrollos) {
    if (!d.ubicacion) continue;
    if (d.id === 'torre-natalini') {
      features.push(...volumenNatalini(e).features);
      continue;
    }
    const origen: [number, number] = [d.ubicacion.longitud, d.ubicacion.latitud];
    const bloque = (x: number, y: number, ancho: number, fondo: number, base: number, altura: number, color: string) => {
      const coordinates = [[-ancho / 2, -fondo / 2], [ancho / 2, -fondo / 2], [ancho / 2, fondo / 2], [-ancho / 2, fondo / 2], [-ancho / 2, -fondo / 2]]
        .map(([a, b]) => desplazar(origen, (a + x) * e.planta, (b + y) * e.planta));
      features.push({ type: 'Feature', properties: { desarrollo: d.id, base, altura, color }, geometry: { type: 'Polygon', coordinates: [coordinates] } });
    };
    if (d.tipo === 'edificio') {
      const altura = ALTURA_EDIFICIO[d.id] ?? 78;
      const v = e.altura;
      bloque(0, 0, 32, 38, 0, 7 * v, '#bb985c');
      bloque(0, 0, 24, 28, 7 * v, altura * v, '#d7b277');
      // Ritmo de bandas de maqueta; no indica la cantidad real de pisos.
      losas(12, altura, 5, 0.5, v, e, (base, tope) => bloque(0, 0, 28, 32, base, tope, '#fffbef'));
      bloque(0, 0, 20, 24, altura * v, (altura + 4) * v, '#fff0cb');
    } else {
      // Barrios como conjunto bajo: crecen parejo para no parecer torres.
      const offset = d.tipo === 'casas' ? DESPLAZAMIENTO_CASAS : 0;
      const v = e.planta;
      bloque(offset, 0, 100, 75, 0, 3 * v, '#bb985c');
      for (const x of [-28, 0, 28]) for (const y of [-20, 20]) {
        bloque(x + offset, y, 19, 16, 3 * v, 12 * v, '#d7b277');
        bloque(x + offset, y, 22, 19, 12 * v, 13 * v, '#fffbef');
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

export function ubicacionesMarq(desarrollos: Desarrollo[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: desarrollos.flatMap(d => d.ubicacion ? [{
      type: 'Feature' as const,
      properties: { desarrollo: d.id },
      geometry: { type: 'Point' as const, coordinates: [d.ubicacion.longitud, d.ubicacion.latitud] },
    }] : []),
  };
}
