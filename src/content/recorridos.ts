// Textos del recorrido 3D, por zona del modelo. Validar con MARQ antes de publicar.
// Fuente: GUIA_MODELO.md de la Torre Natalini y estudiomarq.com.ar.

export type ZonaId = 'exterior' | 'hall' | 'ascensor' | 'palier' | 'depto';

export interface Zona {
  titulo: string;
  texto: string;
}

export const ZONAS_NATALINI: Record<ZonaId, Zona> = {
  exterior: {
    titulo: 'Vereda · Torre Natalini',
    texto: 'Formosa 485 esquina Av. Rivadavia. Basamento con jardineras y acceso vidriado sobre la vereda.',
  },
  hall: {
    titulo: 'Hall de acceso',
    texto: 'Hormigón, piedra clara, sofás verde oliva y obras de color: el lenguaje del hall.',
  },
  ascensor: {
    titulo: 'Ascensor',
    texto: 'Conecta el hall con el palier del departamento muestra.',
  },
  palier: {
    titulo: 'Palier',
    texto: 'Desde aquí se accede al departamento muestra.',
  },
  depto: {
    titulo: 'Departamento muestra',
    texto: '2 dormitorios, estar-comedor con balcón y cocina lineal abierta · 97 m² publicados.',
  },
};

/** Objeto del recorrido con más información: lleva un símbolo «i» encima y se abre con la tecla I al acercarse. */
export interface InfoObjeto {
  id: string;
  /** Nombre corto para el aviso («I · Plantas del acceso»). */
  nombre: string;
  titulo: string;
  texto: string;
  datos?: string[];
  /** Dónde flota el símbolo «i», en coordenadas de la escena (metros). */
  marcador: [number, number, number];
}

// Ejemplo inicial: describe la ambientación del modelo, sin datos del edificio real.
export const OBJETOS_NATALINI: InfoObjeto[] = [
  {
    id: 'plantas-acceso',
    nombre: 'Plantas del acceso',
    titulo: 'Verde para recibir',
    texto:
      'Contra el vidrio del acceso, dos macetas altas levantan las plantas a la altura de la mirada. Sus hojas anchas suavizan el hormigón y la piedra clara, y reciben a quien entra desde la vereda.',
    datos: ['Macetas altas negras, en forma de reloj de arena', 'Plantas de hojas anchas', 'Ambientación ilustrativa'],
    marcador: [2.24, 2.05, -0.72],
  },
];

export const AVISO_MODELO =
  'Dimensiones de ambientes basadas en el plano suministrado. Altura, aberturas, núcleo y ubicación en la torre pendientes de confirmación. Ambientación ilustrativa.';
