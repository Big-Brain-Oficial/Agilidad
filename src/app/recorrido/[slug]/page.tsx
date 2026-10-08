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
  return { title: d ? `${d.nombre} · Recorrido 3D · MARQ Experience` : 'MARQ Experience' };
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
