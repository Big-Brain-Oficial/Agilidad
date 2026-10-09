# Mapa de Resistencia · primera iteración

La pantalla `/` utiliza MapLibre GL JS 6.13 y cartografía vectorial de OpenFreeMap, basada en OpenStreetMap / OpenMapTiles. Las calles, plazas, lagunas y edificios de contexto proceden de esa cartografía, con la cobertura y actualización de la fuente; no se generan manzanas ficticias.

## Representación

- Cámara inclinada 42° con perspectiva cerrada (campo de visión de 24° en lugar de los 36,9° de MapLibre): las torres altas no se tuercen hacia los bordes y la ciudad se lee como una maqueta. Neutros cálidos, agua azul suave y parques verdes.
- Edificios de contexto planos y discretos para dar protagonismo a MARQ.
- Los diez desarrollos tienen una maqueta cartográfica simplificada, de escala visual aumentada y halo cálido sobre el suelo. Las torres se distinguen por altura y bandas claras; barrios y casas, por conjuntos bajos. Las dimensiones, altura, orientación y retranqueos son orientativos, no medidas de obra. Natalini conserva la huella de su esquina como referencia.
- **Escala según el zoom** (`escalaMaqueta`): al alejarse, las maquetas crecen para seguir leyéndose sobre la ciudad; desde el zoom 17 quedan con su tamaño de referencia. La altura de las torres crece más que la planta, y la planta tiene tope para que UNO Boulevard y NBCH (a ~290 m) no se toquen. El GeoJSON se regenera por pasos de 0,05 de zoom.
- **Vista general**: el mapa abre encuadrando todos los desarrollos menos Pueblo Mío (Puerto Tirol, a ~12 km: sumarlo amontona las torres del centro; se llega desde la lista). El encuadre se calcula con la inclinación y la altura de las torres (`encuadre.ts` reproduce la proyección de MapLibre) y se recalcula si cambia el tamaño de la ventana. El botón **Vista general** del panel derecho vuelve a ese encuadre; también «← Todos los desarrollos» en la ficha y Esc.
- **Tarjetas**: de lejos muestran sólo el nombre. Cada una se ubica debajo de su maqueta, a un lado, más abajo con tallo largo o sobre la punta de la torre, evitando tapar otras tarjetas, otras torres y el título. Las de maquetas fuera de pantalla se ocultan.
- El marcador y el volumen permiten abrir la ficha. La decisión de entrar al recorrido inmersivo sigue en el botón de la ficha.
- Sólo se sitúan desarrollos con `ubicacion`. El catálogo mantiene el resto, indicando que su ubicación está pendiente.
- El arrastre y la rueda/pellizco son interacciones nativas del mapa. En celular se oculta la ayuda de arrastre para dejar lugar a las tarjetas.

El mapa no importa Three.js ni el GLB de Natalini. La representación usa polígonos GeoJSON y extrusiones de MapLibre. No se modificó el código del recorrido inmersivo.

## Archivos

| Archivo | Uso |
|---|---|
| `src/components/map/MapCanvas.tsx` | Ciclo de vida de MapLibre, vista general, selección, foco, tarjetas, carga y recuperación de errores |
| `src/components/map/encuadre.ts` | Proyección de la cámara (Mercator con perspectiva) para calcular encuadres sin mover el mapa |
| `public/maps/resistencia.json` | Estilo derivado de OpenFreeMap Positron; fuentes, colores y rótulos |
| `src/content/desarrollos.ts` | Ubicación geográfica y catálogo |
| `src/content/mapa-resistencia.ts` | Volúmenes esquemáticos, escala según el zoom, puntos de luz y desarrollos fuera de la vista general |

MapLibre se importa en el cliente. Next publica su worker como un recurso local con hash, usando el patrón oficial para Turbopack. El estilo se sirve desde el proyecto; las teselas, fuentes y sprites cartográficos provienen de OpenFreeMap. La atribución se conserva en pantalla. No hace falta una clave ni un servidor GIS propio.

## Ubicación y fuentes

Verificación: 8 de octubre de 2026.

- [MARQ · Torre Natalini](https://estudiomarq.com.ar/torre-natalini/): Formosa 485, esquina Av. Rivadavia.
- [OSM · huella en esa esquina](https://www.openstreetmap.org/way/1102375879): vértices del polígono y orientación. OSM todavía la etiqueta como construcción; no se usa esa etiqueta para determinar el estado comercial del desarrollo.
- [Nominatim · consulta del domicilio](https://nominatim.openstreetmap.org/search?q=Formosa%20485%2C%20Resistencia%2C%20Chaco%2C%20Argentina&format=jsonv2): valida la ubicación del número sobre Formosa. El punto geocodificado es una interpolación de dirección, por lo que el volumen se centra en la huella de la esquina.
- Centro de esa huella: longitud **-58.988587**, latitud **-27.4418294**.
- [Torre Vista](https://estudiomarq.com.ar/torre-vista/): Salta 389. Nominatim identifica el edificio: **-58.9926442, -27.450657**.
- [UNO Boulevard](https://estudiomarq.com.ar/uno-boulevard/): Sarmiento 645. Geocodificación del domicilio: **-58.9809758, -27.4459795**.
- [GABA](https://estudiomarq.com.ar/gaba/): Jujuy 751. Geocodificación del domicilio: **-58.9984018, -27.4500631**.
- [NBCH](https://estudiomarq.com.ar/torre-nbch/): Pellegrini 761. Geocodificación del domicilio: **-58.9782067, -27.4467125**.
- [Panorama](https://estudiomarq.com.ar/torre-panorama/): Sarmiento 1502. Geocodificación del domicilio: **-58.9728771, -27.4391078**.
- [Catálogo oficial MARQ](https://estudiomarq.com.ar/): Gran Arboledas, Sarmiento 4650; Brisas del Norte y Casas BDN, Juan Manuel de Rosas 3700. Los puntos de los establecimientos en los mapas públicos son **-58.9444023, -27.4130793** y **-58.9767655, -27.3997939** respectivamente. Casas BDN comparte el punto del barrio: la disposición de sus volúmenes es gráfica, no la ubicación de una unidad específica.
- [Pueblo Mío](https://estudiomarq.com.ar/inmuebles/terreno-400m2-barrioprivado-pueblomio/): RN 11 km 1016, Puerto Tirol. Punto del establecimiento en el mapa enlazado: **-59.0123224, -27.3423056**.

Salvo la huella de Natalini y la identificación de Vista, estos puntos representan el domicilio/acceso o la referencia del desarrollo, no una mensura del predio. La maqueta de cada edificio es ilustrativa. Ningún volumen nuevo habilita automáticamente un recorrido: sólo Natalini tiene `recorrido3d`.
- [OpenFreeMap · inicio rápido](https://openfreemap.org/quick_start/).
- [MapLibre · instalación, incluido Next/Turbopack](https://maplibre.org/maplibre-gl-js/docs/).

El estilo base se obtuvo de `https://tiles.openfreemap.org/styles/positron`. Los polígonos y la atribución siguen sujetos a las licencias de sus respectivas fuentes. La precisión y cobertura de la ciudad dependen de los datos cartográficos disponibles.
