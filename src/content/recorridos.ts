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

/** Objeto del recorrido con más información: se muestra con la tecla I al mirarlo de cerca. */
export interface InfoObjeto {
  id: string;
  /** Nombre corto para el aviso («I · Planta del hall»). */
  nombre: string;
  titulo: string;
  texto: string;
  datos?: string[];
  /** Centro y radio de la esfera que envuelve al objeto, en coordenadas de la escena (metros). */
  centro: [number, number, number];
  radio: number;
}

// Ejemplo inicial: describe la ambientación del modelo, sin datos del edificio real.
export const OBJETOS_NATALINI: InfoObjeto[] = [
  {
    id: 'planta-hall',
    nombre: 'Planta del hall',
    titulo: 'Verde para recibir',
    texto:
      'En un hall de hormigón y piedra clara, la planta es lo único vivo: junto a los sillones verde oliva, sus hojas anchas suavizan el material y acompañan a quien espera el ascensor.',
    datos: ['Maceta de barro cocido', 'Hall de acceso, junto a los sillones', 'Ambientación ilustrativa'],
    centro: [2.57, 0.5, -6.1],
    radio: 0.55,
  },
];

export const AVISO_MODELO =
  'Dimensiones de ambientes basadas en el plano suministrado. Altura, aberturas, núcleo y ubicación en la torre pendientes de confirmación. Ambientación ilustrativa.';
