# MARQ Experience

Mapa 2D de los desarrollos de MARQ y recorrido 3D en primera persona por la Torre Natalini: vereda, hall, ascensor y departamento. El **MARQ Bus** te lleva de vuelta al mapa.

La arquitectura y las decisiones técnicas están en [ARQUITECTURA.md](ARQUITECTURA.md).

## Correr el proyecto

Requiere Node 20 o superior.

```bash
npm install
npm run dev        # http://localhost:3000  (detener: Ctrl + C)
```

Versión de producción local:

```bash
npm run build
npm start
```

## Deploy en Vercel

Importar el repositorio en Vercel: detecta Next.js solo. No hace falta configurar variables de entorno ni base de datos.

## Modelo 3D

El GLB que usa la web ya está en `public/models/`. Solo hay que regenerarlo si cambia el `.blend`:

```bash
npm run model:build
```

Necesita **Blender 4.5 LTS**. El script lo busca en `BLENDER_PATH`, en `C:\Users\<usuario>\tools\blender-4.5.*` o en el `PATH`.

## Editar contenido

| Qué | Dónde |
|---|---|
| Desarrollos del mapa: textos, estado, posición en el plano, recorrido 3D | `src/content/desarrollos.ts` |
| Textos de cada zona del recorrido | `src/content/recorridos.ts` |
| Plano ilustrado: calles, loteos, lagunas, rótulos | `src/components/map/mapGeometry.ts` |

Los textos salen de estudiomarq.com.ar y hay que **validarlos con MARQ** antes de publicar.

## Depuración

`/recorrido/torre-natalini?debug` habilita moverse sin capturar el mouse y expone `window.marq` en la consola:

- `marq.state()`: posición, zona y fase.
- `marq.teleport(x, y, z)`: mueve al visitante.
- `marq.look(yaw, pitch)`: orienta la mirada.
- `marq.interact()`: equivale a apretar E.
