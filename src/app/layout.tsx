import type { Metadata, Viewport } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import { Curtain } from '@/components/transition/Curtain';
import './globals.css';

// Mismas familias que estudiomarq.com.ar.
const montserrat = Montserrat({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-display' });
const inter = Inter({ subsets: ['latin'], variable: '--font-text' });

const descripcion = 'Recorré los desarrollos de MARQ: un mapa de la ciudad y la Torre Natalini en primera persona.';

export const metadata: Metadata = {
  // Las previews de links (WhatsApp, redes) necesitan URLs absolutas para og:image.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://estudiomarq.vercel.app',
  ),
  title: 'MARQ Experience',
  description: descripcion,
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: 'MARQ Experience',
    title: 'MARQ Experience',
    description: descripcion,
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: '#F2F1ED',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${montserrat.variable} ${inter.variable}`}>
      <body>
        {children}
        <Curtain />
      </body>
    </html>
  );
}
