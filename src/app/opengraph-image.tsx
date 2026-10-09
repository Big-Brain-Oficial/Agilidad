import { TAMANO_PREVIEW, tarjetaPreview } from '@/components/preview/tarjetaPreview';

export const alt = 'MARQ Experience: mapa de los desarrollos de MARQ y recorrido 3D por la Torre Natalini';
export const size = TAMANO_PREVIEW;
export const contentType = 'image/png';

export default function Image() {
  return tarjetaPreview({
    etiqueta: 'Estudio MARQ',
    titulo: 'MARQ Experience',
    bajada: 'Recorré los desarrollos de MARQ en el mapa y entrá a la Torre Natalini en primera persona.',
  });
}
