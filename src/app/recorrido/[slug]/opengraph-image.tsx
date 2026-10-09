import { TAMANO_PREVIEW, tarjetaPreview } from '@/components/preview/tarjetaPreview';
import { DESARROLLOS, desarrolloConRecorrido } from '@/content/desarrollos';

export const alt = 'Recorrido 3D en primera persona · MARQ Experience';
export const size = TAMANO_PREVIEW;
export const contentType = 'image/png';

export function generateStaticParams() {
  return DESARROLLOS.filter((d) => d.recorrido3d).map((d) => ({ slug: d.recorrido3d!.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = desarrolloConRecorrido(slug);
  return tarjetaPreview({
    etiqueta: 'Recorrido 3D · MARQ Experience',
    titulo: d?.nombre ?? 'MARQ Experience',
    bajada: d ? `Recorrela en primera persona. ${d.lugar}.` : 'Recorré los desarrollos de MARQ.',
  });
}
