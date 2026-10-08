import type { Metadata, Viewport } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import { Curtain } from '@/components/transition/Curtain';
import './globals.css';

// Mismas familias que estudiomarq.com.ar.
const montserrat = Montserrat({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-display' });
const inter = Inter({ subsets: ['latin'], variable: '--font-text' });

export const metadata: Metadata = {
  title: 'MARQ Experience',
  description: 'Recorré los desarrollos de MARQ: un mapa de la ciudad y la Torre Natalini en primera persona.',
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
