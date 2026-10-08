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

export const AVISO_MODELO =
  'Dimensiones de ambientes basadas en el plano suministrado. Altura, aberturas, núcleo y ubicación en la torre pendientes de confirmación. Ambientación ilustrativa.';
