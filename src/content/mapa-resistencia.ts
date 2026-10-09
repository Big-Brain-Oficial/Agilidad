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

// Representación cartográfica independiente del GLB y del recorrido inmersivo.
// Los 26 niveles salen del catálogo; dimensiones y retranqueo son orientativos.
// La escala visual destaca MARQ en la maqueta y no expresa dimensiones de obra.
export function volumenNatalini(): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = [];
  const planta = (escala: number) => HUELLA.map(([lon, lat]) => [
    NATALINI_CENTRO[0] + (lon - NATALINI_CENTRO[0]) * escala,
    NATALINI_CENTRO[1] + (lat - NATALINI_CENTRO[1]) * escala,
  ]);
  const agregar = (escala: number, base: number, altura: number, color: string) => {
    features.push({
      type: 'Feature',
      properties: { desarrollo: 'torre-natalini', base: base * 1.3, altura: altura * 1.3, color },
      geometry: { type: 'Polygon', coordinates: [planta(escala * 1.5)] },
    });
  };

  agregar(1, 0, 4, '#bb985c');
  agregar(0.87, 4, 78, '#d7b277');
  // Losas claras: dan lectura de los pisos sin cargar un modelo arquitectónico.
  for (let piso = 2; piso <= 26; piso++) {
    agregar(0.96, piso * 3 - 0.25, piso * 3, '#fffbef');
  }
  agregar(0.68, 78, 81, '#fff0cb');
  return { type: 'FeatureCollection', features };
}

/** Maquetas orientativas: no reproducen planos ni sustituyen los recorridos 360. */
export function volumenesMarq(desarrollos: Desarrollo[]): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = [];
  for (const d of desarrollos) {
    if (!d.ubicacion) continue;
    if (d.id === 'torre-natalini') {
      features.push(...volumenNatalini().features);
      continue;
    }
    // Metros en un plano local; la planta y altura son una escala gráfica deliberada.
    const lonPorMetro = 1 / (111320 * Math.cos(d.ubicacion.latitud * Math.PI / 180));
    const latPorMetro = 1 / 111320;
    const bloque = (x: number, y: number, ancho: number, fondo: number, base: number, altura: number, color: string) => {
      const angulo = -Math.PI / 4;
      const coordinates = [[-ancho / 2, -fondo / 2], [ancho / 2, -fondo / 2], [ancho / 2, fondo / 2], [-ancho / 2, fondo / 2], [-ancho / 2, -fondo / 2]].map(([a, b]) => [
        d.ubicacion!.longitud + ((a + x) * Math.cos(angulo) - (b + y) * Math.sin(angulo)) * lonPorMetro,
        d.ubicacion!.latitud + ((a + x) * Math.sin(angulo) + (b + y) * Math.cos(angulo)) * latPorMetro,
      ]);
      features.push({ type: 'Feature', properties: { desarrollo: d.id, base, altura, color }, geometry: { type: 'Polygon', coordinates: [coordinates] } });
    };
    if (d.tipo === 'edificio') {
      const altura = d.id === 'uno-boulevard' ? 48 : d.id === 'torre-panorama' ? 115 : 78;
      bloque(0, 0, 32, 38, 0, 7, '#bb985c');
      bloque(0, 0, 24, 28, 7, altura, '#d7b277');
      // Ritmo de bandas de maqueta; no indica la cantidad real de pisos.
      for (let z = 12; z <= altura; z += 5) bloque(0, 0, 28, 32, z - 0.5, z, '#fffbef');
      bloque(0, 0, 20, 24, altura, altura + 4, '#fff0cb');
    } else {
      // Barrios como conjunto bajo; Casas BDN comparte el domicilio del barrio.
      const offset = d.tipo === 'casas' ? 65 : 0;
      bloque(offset, 0, 100, 75, 0, 3, '#bb985c');
      for (const x of [-28, 0, 28]) for (const y of [-20, 20]) {
        bloque(x + offset, y, 19, 16, 3, 12, '#d7b277');
        bloque(x + offset, y, 22, 19, 12, 13, '#fffbef');
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
