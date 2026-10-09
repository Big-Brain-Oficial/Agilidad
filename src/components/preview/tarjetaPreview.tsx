import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// Imagen que muestran WhatsApp, redes, etc. al compartir un link (og:image).
// Usa el mismo logo que el favicon (src/app/icon.svg): las apps no aceptan SVG
// como preview, así que se dibuja en un PNG de 1200 × 630 durante el build.

export const TAMANO_PREVIEW = { width: 1200, height: 630 };

export async function tarjetaPreview({ etiqueta, titulo, bajada }: { etiqueta: string; titulo: string; bajada: string }) {
  const logo = await readFile(join(process.cwd(), 'src/app/icon.svg'));
  const logoSrc = `data:image/svg+xml;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 64,
          padding: '0 88px',
          background: '#f2f1ed',
          color: '#1d1d1f',
          borderBottom: '16px solid #a4070f',
        }}
      >
        <img src={logoSrc} width={300} height={300} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', color: '#a4070f' }}>{etiqueta}</div>
          <div style={{ fontSize: 76, lineHeight: 1.05, marginTop: 16 }}>{titulo}</div>
          <div style={{ fontSize: 32, lineHeight: 1.35, marginTop: 28, color: '#5a5650' }}>{bajada}</div>
        </div>
      </div>
    ),
    TAMANO_PREVIEW,
  );
}
