// Desarrollos de MARQ que aparecen en el mapa.
//
// Fuente de los textos: estudiomarq.com.ar (octubre 2026). Validar con MARQ antes de publicar.
// `mapa` son coordenadas del plano ilustrado (viewBox 3000 x 2500, norte arriba): no son geográficas.
import modelos from './modelos.generated.json';

export type TipoDesarrollo = 'edificio' | 'barrio' | 'casas';
export type EstadoDesarrollo = 'actual' | 'futuro';

export interface Desarrollo {
  id: string;
  nombre: string;
  tipo: TipoDesarrollo;
  estado: EstadoDesarrollo;
  /** Texto visible del estado, si se conoce. */
  etiquetaEstado?: string;
  lugar: string;
  resumen: string;
  datos?: string[];
  url: string;
  mapa: { x: number; y: number };
  /** Ubicación confirmada para la cartografía real. Los puntos del SVG no se convierten. */
  ubicacion?: { longitud: number; latitud: number };
  /** Si tiene recorrido 3D: slug de la ruta y modelo de public/models. */
  recorrido3d?: { slug: string; modelo: keyof typeof modelos };
}

export const TIPOS: Record<TipoDesarrollo, string> = {
  edificio: 'Edificio',
  barrio: 'Barrio',
  casas: 'Casas',
};

export const DESARROLLOS: Desarrollo[] = [
  {
    id: 'torre-natalini',
    nombre: 'Torre Natalini',
    tipo: 'edificio',
    estado: 'actual',
    etiquetaEstado: 'Terminada · 2024',
    lugar: 'Formosa 485 esq. Av. Rivadavia, Resistencia',
    resumen:
      'Torre residencial en una esquina con perímetro libre: líneas puras, espacios amplios y luminosos, y amenities para habitar el edificio más allá de cada departamento.',
    datos: ['26 pisos · 90 departamentos', '10.172 m² construidos', 'Piscina, gimnasio, yoga y solarium', 'Aberturas con doble vidriado hermético'],
    url: 'https://estudiomarq.com.ar/torre-natalini/',
    mapa: { x: 1348, y: 1690 },
    ubicacion: { longitud: -58.988587, latitud: -27.4418294 },
    recorrido3d: { slug: 'torre-natalini', modelo: 'torre-natalini' },
  },
  {
    id: 'torre-vista',
    nombre: 'Torre Vista',
    tipo: 'edificio',
    estado: 'actual',
    lugar: 'Salta 389, Resistencia',
    resumen: 'Edificio en esquina de vivienda multifamiliar con características mixtas: una semitorre en basamento y una torre en altura.',
    url: 'https://estudiomarq.com.ar/torre-vista/',
    mapa: { x: 716, y: 2116 },
    ubicacion: { longitud: -58.9926442, latitud: -27.450657 },
  },
  {
    id: 'uno-boulevard',
    nombre: 'Uno Boulevard',
    tipo: 'edificio',
    estado: 'actual',
    lugar: 'Av. Sarmiento 645, Resistencia',
    resumen: 'Juego de volúmenes y líneas que generan diversidad de planos en la contrafachada, privilegiando la iluminación natural y las vistas lejanas.',
    url: 'https://estudiomarq.com.ar/uno-boulevard/',
    mapa: { x: 1716, y: 2116 },
    ubicacion: { longitud: -58.9809758, latitud: -27.4459795 },
  },
  {
    id: 'edificio-gaba',
    nombre: 'Edificio GABA',
    tipo: 'edificio',
    estado: 'actual',
    lugar: 'Jujuy 751, Resistencia',
    resumen: 'Proyección urbana y versátil, diseñada de manera flexible bajo el concepto LIVE & WORK: viviendas, oficinas y alquiler temporario.',
    url: 'https://estudiomarq.com.ar/gaba/',
    mapa: { x: 516, y: 1716 },
    ubicacion: { longitud: -58.9984018, latitud: -27.4500631 },
  },
  {
    id: 'torre-nbch',
    nombre: 'Torre NBCH',
    tipo: 'edificio',
    estado: 'futuro',
    etiquetaEstado: 'Nuevo emprendimiento',
    lugar: 'Pellegrini 761, Resistencia',
    resumen: 'Nuevo emprendimiento de la Mutual Bancaria del Personal del Nuevo Banco del Chaco. Una inversión segura que crea valor en la ciudad.',
    url: 'https://estudiomarq.com.ar/torre-nbch/',
    mapa: { x: 1116, y: 2316 },
    ubicacion: { longitud: -58.9782067, latitud: -27.4467125 },
  },
  {
    id: 'torre-panorama',
    nombre: 'Torre Panorama',
    tipo: 'edificio',
    estado: 'futuro',
    etiquetaEstado: 'Próximamente',
    lugar: 'Av. Sarmiento 1502, Resistencia',
    resumen: 'Proyecto de 25.000 m² en altura. «Innovando los límites de la oferta inmobiliaria.»',
    url: 'https://estudiomarq.com.ar/torre-panorama/',
    mapa: { x: 1916, y: 1716 },
    ubicacion: { longitud: -58.9728771, latitud: -27.4391078 },
  },
  {
    id: 'gran-arboledas',
    nombre: 'Gran Arboledas',
    tipo: 'barrio',
    estado: 'actual',
    etiquetaEstado: '193 lotes',
    lugar: 'Av. Sarmiento 4650, Resistencia',
    resumen: 'Loteo con infraestructura completa que preserva la reserva silvestre autóctona, con senda peatonal y un entorno tranquilo a minutos de la ciudad.',
    datos: ['Calles, luz, agua, cloacas y desagüe pluvial', 'Reserva de árboles nativos'],
    url: 'https://estudiomarq.com.ar/gran-arboledas/',
    mapa: { x: 616, y: 820 },
    ubicacion: { longitud: -58.9444023, latitud: -27.4130793 },
  },
  {
    id: 'brisas-del-norte',
    nombre: 'Brisas del Norte',
    tipo: 'barrio',
    estado: 'actual',
    etiquetaEstado: '77 lotes',
    lugar: 'Juan Manuel de Rosas 3700, Resistencia',
    resumen: 'Loteo residencial con laguna parquizada, muelle costero y reserva silvestre reforestada con especies autóctonas.',
    datos: ['7 lotes con costa a la laguna', 'Juegos infantiles y cancha de fútbol'],
    url: 'https://estudiomarq.com.ar/brisas-del-norte/',
    mapa: { x: 1300, y: 560 },
    ubicacion: { longitud: -58.9767655, latitud: -27.3997939 },
  },
  {
    id: 'casas-bdn',
    nombre: 'Casas BDN',
    tipo: 'casas',
    estado: 'actual',
    etiquetaEstado: 'Casa + terreno',
    lugar: 'Juan Manuel de Rosas 3700, Brisas del Norte',
    resumen: 'Tu casa y tu terreno en un barrio costero consolidado, habitado y en pleno crecimiento. Casas emplazadas para aprovechar las vistas a la laguna.',
    url: 'https://estudiomarq.com.ar/casas-bdn-brisasdelnorte/',
    mapa: { x: 1340, y: 930 },
    ubicacion: { longitud: -58.9767655, latitud: -27.3997939 },
  },
  {
    id: 'pueblo-mio',
    nombre: 'Pueblo Mío',
    tipo: 'barrio',
    estado: 'actual',
    etiquetaEstado: '100 ha · 228 lotes',
    lugar: 'Ruta Nacional 11 km 1016, Puerto Tirol',
    resumen: 'Barrio privado que pivota sobre el agua y los árboles: un arroyo recuperado como laguna con paseo costero y monte nativo en reserva.',
    datos: ['Lotes de 296 a 3.941 m²', 'Acceso controlado y seguridad perimetral'],
    url: 'https://estudiomarq.com.ar/pueblo-mio/',
    mapa: { x: 2420, y: 640 },
    ubicacion: { longitud: -59.0123224, latitud: -27.3423056 },
  },
];

export const desarrolloConRecorrido = (slug: string) => DESARROLLOS.find((d) => d.recorrido3d?.slug === slug);
export const urlModelo = (id: keyof typeof modelos) => modelos[id].url;
