import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ExperienceGate } from '@/components/experience/ExperienceGate';
import { DESARROLLOS, desarrolloConRecorrido } from '@/content/desarrollos';

// Una ruta por desarrollo con recorrido 3D (hoy: /recorrido/torre-natalini).

export const dynamicParams = false;

export function generateStaticParams() {
  return DESARROLLOS.filter((d) => d.recorrido3d).map((d) => ({ slug: d.recorrido3d!.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = desarrolloConRecorrido(slug);
  if (!d) return { title: 'MARQ Experience' };
  const title = `${d.nombre} · Recorrido 3D · MARQ Experience`;
  const description = `Recorré ${d.nombre} en primera persona. ${d.resumen}`;
  // openGraph reemplaza entero al del layout: se repiten siteName y locale.
  return {
    title,
    description,
    openGraph: { type: 'website', locale: 'es_AR', siteName: 'MARQ Experience', title, description },
  };
}

export default async function RecorridoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = desarrolloConRecorrido(slug);
  if (!d) notFound();
  return (
    <Suspense>
      <ExperienceGate desarrolloId={d.id} />
    </Suspense>
  );
}
