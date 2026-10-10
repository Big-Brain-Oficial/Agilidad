# Torre Natalini — modelo ArchViz interpretativo

Versión 01 · Referencias suministradas por el usuario · Blender 4.5 LTS

## Alcance y precisión

Se entrega una reconstrucción editable de la volumetría general, un hall inspirado en las fotografías, un departamento trazado sobre su planta y un recorrido animado calle–hall–ascensor–departamento. La ubicación del departamento es provisional, autorizada por el usuario. El archivo no representa un relevamiento arquitectónico ni un proyecto ejecutivo.

La planta del departamento permite recuperar la organización en L y sus ambientes. La planta baja dice expresamente «esc. esquemática»; no permite obtener medidas exactas. No se dispone de planta tipo que relacione departamento y núcleo, cortes de alturas o una implantación verificable. Por ese motivo, la geometría exterior y el enlace vertical son aproximaciones editables.

### Datos leídos de la lámina del departamento

| Dato | Referencia | Tratamiento |
|---|---|---|
| Superficie total | 97 m², ficha comercial | Dato documental; no se fuerza la malla a esta superficie |
| Dormitorios | 2 | Ambos modelados y amoblados |
| Dormitorio principal | 3,90 × 2,70 m | Referencia para calibración |
| Segundo dormitorio | 3,60 × 2,70 m | Referencia; tiene entrantes y placard |
| Estar-comedor | 5,40 × 3,40 m | Referencia principal de proporciones |
| Cocina | 1,60 × 5,35 m | Cocina lineal abierta, mobiliario aproximado |
| Baño | 1,20 × 2,95 m | Planta con ducha, lavabo y sanitarios |
| Toilette | 1,30 × 1,40 m | Local pequeño próximo a la entrada |
| Balcón | 1,45 × 2,50 m | El entrante del plano condiciona su superficie útil |
| Número «104» | Impreso en plano | No se interpreta como piso confirmado |

La captura raster se calibra aproximadamente a 40,7 píxeles por metro. Sus rótulos y contornos no permiten satisfacer simultáneamente todas las cotas con exactitud. El archivo `verificacion.json` informa la superficie del contorno trazado, que incluye espesores y balcón. No equivale a superficie útil ni a superficie comercial. La diferencia con los 97 m² requiere consultar el plano original y su criterio de cómputo; no puede atribuirse con certeza a partes comunes.

### Referencias fotográficas

- Torre: entramado claro de losas y elementos verticales, cerramientos oscuros, balcones y coronamiento.
- Basamento: jardineras horizontales y acceso vidriado sobre vereda.
- Hall: hormigón, superficies pétreas claras, sofá verde oliva, mesas negras y obras de color. Se reproduce su lenguaje con mobiliario simplificado, no como réplicas exactas de productos.
- Departamento: cielorraso de hormigón, piso de madera, placares blancos y carpinterías oscuras. La foto amoblada sirve como referencia de ambiente; no acredita la posición exacta de cada mueble.
- La imagen del frente rojizo queda conservada entre las referencias; no se incorpora a la fachada principal porque su relación con la torre no es inequívoca.

## Abrir y recorrer

1. Abrir `Torre_Natalini_Interpretativa.blend` en Blender 4.5 LTS o una versión compatible posterior. No requiere instalar add-ons.
2. Leer `LEEME_PRIMERO` en el Text Editor. Las 16 referencias están empaquetadas en el archivo y ocultas en `00_REFERENCIAS`.
3. Las cámaras `01_EXTERIOR`, `02_HALL`, `03_ESTAR`, `04_PLANTA` y `05_AXONOMETRICA` permiten inspeccionar sectores. Seleccionar una cámara y usar View > Cameras > Set Active Object as Camera; entrar en vista de cámara con Numpad 0.
4. Para el recorrido, activar `06_RECORRIDO`, volver al fotograma 1 y reproducir. Hay 1100 fotogramas a 24 fps, aproximadamente 46 segundos. Los marcadores indican los tramos.
5. Para caminar manualmente: View > Navigation > Walk Navigation. Es navegación de Blender; no se entrega un ejecutable interactivo ni un sistema de puertas accionables.
6. Para ver el departamento sin techo, ocultar `09_TECHOS`. Para una axonométrica limpia, ocultar además entorno, podio, fachada, hall y núcleo. No borrar estas colecciones.

El ascensor es una cabina abierta animada y un hueco vertical. La subida funciona como transición visual. No incluye cinemática de puertas ni automatismo de llamada. No se modela una escalera completa, ya que faltan cortes y dimensiones para conectarla con fidelidad.

En la versión ArchViz (`scripts/blender/rebuild_archviz.py`) el ascensor llega a un pasillo de piedra que termina en la puerta del departamento. Para que el pasillo entre, el hueco del piso del departamento está 3,9 m al este del de planta baja, y el hueco de planta baja termina debajo de esa losa. No es una solución constructiva: en el recorrido web la cabina cambia de hueco con las puertas cerradas. La animación `06_RECORRIDO` del archivo interpretativo conserva el trayecto anterior.

## Organización de escena

| Colección | Contenido |
|---|---|
| 00_REFERENCIAS | Imágenes originales empaquetadas |
| 01_ENTORNO | Calle, vereda y terreno simplificados |
| 02_PODIO | Columnas, losas, vidrio y jardineras |
| 03_FACHADA_MODULAR | Plantas repetidas con mallas compartidas |
| 04_HALL | Cerramientos, acceso y mobiliario |
| 05_NUCLEO_PROVISIONAL | Caja, cabina animada y descansos |
| 06_DEPTO_MUROS | Suelo, cerramientos y tabiques |
| 07_DEPTO_ABERTURAS | Ventanas, puertas abiertas y barandas |
| 08_DEPTO_MOBILIARIO | Camas, placares, estar, cocina y sanitarios |
| 09_TECHOS | Cielorrasos ocultables para inspección |
| 10_LUCES | Sol, luces de área e iluminación interior |
| 11_CAMARAS | Cámaras estáticas y recorrido |
| 12_RECORRIDO | Guía espacial del trayecto |
| 13_GUIAS | Controles y metadatos |

Las colecciones agrupan visibilidad; los objetos Empty cumplen el papel de controles de transformación. `DEPTO_CTRL` concentra geometría e iluminación del departamento. `ASCENSOR_CTRL` agrupa la cabina. `EDIFICIO_CTRL` se reserva como referencia del edificio y padre de `DEPTO_CTRL`: no mueve automáticamente todos los elementos del contexto. Las cámaras y el recorrido están en coordenadas globales; si se cambia la implantación hay que regenerarlos o ajustarlos.

Escala métrica real: 1 unidad = 1 m. XY representa la planta y Z la altura. El origen está en el acceso aproximado a la torre. Las dimensiones básicas se aplican antes de añadir biseles.

## Flujo de modelado recomendado

1. **Documentación y calibración.** Obtener plano original PDF/DWG con cotas, planta tipo y cortes. Bloquear la escala usando al menos dos cotas perpendiculares. Clasificar cada medida como documentada, inferida o provisional.
2. **Envolvente general.** Definir terreno, línea municipal, acceso, basamento, alturas de niveles y coronamiento. Usar volúmenes simples y cámaras coincidentes con las fotos antes de detallar.
3. **Núcleo y conectividad.** Fijar ubicación de escaleras, ascensores, palieres y puerta del departamento. Comprobar continuidad de pisos, huecos de losas y anchos de paso.
4. **Departamento.** Trazar el contorno y tabiques sobre plano calibrado; incorporar vanos reales, dinteles, antepechos y espesores. Separar techos para facilitar inspección.
5. **Fachada modular.** Construir un módulo repetible y usar instancias o duplicados enlazados. Hacer independientes solo los módulos que necesiten diferencias.
6. **Detalle interior.** Agregar marcos, zócalos, placares, muebles de cocina y sanitarios. Mantener aberturas libres. Después incorporar mobiliario suelto y decoración.
7. **Materiales.** Trabajar hormigón, madera, piedra, pintura, metal y vidrio con escala física. En esta entrega los materiales son procedurales; para una versión fotorealista final conviene sustituir madera y piedra por texturas PBR calibradas.
8. **Iluminación.** Validar primero con materiales neutros. Ajustar luz exterior, exposición y luminarias. No resolver errores geométricos oscureciendo la escena.
9. **Recorrido.** Definir altura de ojo, velocidad, pausas y giros. Revisar la trayectoria completa; las cámaras no heredan automáticamente colisiones físicas.
10. **Optimización y entrega.** Revisar normales y geometría repetida, empaquetar recursos, documentar supuestos y generar vistas de control.

## Técnicas y add-ons

Esta escena usa herramientas nativas y Python: mallas por tramos, extrusión/solidificación, pequeños biseles, normales ponderadas y duplicados enlazados. Los huecos están construidos con segmentos, evitando cadenas extensas de booleanas y facilitando la edición. Los pisos repetidos comparten datos de malla; sus interiores completos se omiten. El detalle se concentra en los lugares recorridos.

**Archipack** puede acelerar muros, puertas y ventanas paramétricas cuando se disponga de documentación definitiva. Es opcional; comprobar la compatibilidad de la edición instalada con Blender. Documentación oficial: https://blender-archipack.gitlab.io/

**Bonsai, antes BlenderBIM**, tiene sentido si se necesita autoría IFC, propiedades constructivas y documentación BIM. No es necesario para este objetivo visual y este archivo no es un modelo IFC. Página oficial: https://extensions.blender.org/add-ons/bonsai/

Los duplicados enlazados reducen memoria y propagan cambios en el módulo: https://docs.blender.org/manual/en/latest/scene_layout/object/editing/duplicate_linked.html

Navegación de Blender: https://docs.blender.org/manual/en/latest/editors/3dview/navigate/walk_fly.html

## Regeneración

El script `crear_torre_natalini.py` es la fuente editable y también está dentro del .blend. Ejecutarlo únicamente en un archivo nuevo o guardado: comienza con una escena vacía y reemplaza la escena activa.

En Blender: Scripting > Open > seleccionar script > Run Script. Guarda el .blend y genera imágenes en la carpeta del script. Para usar otra carpeta, definir la variable de entorno `ARCHVIZ_OUTPUT`. Con `ARCHVIZ_RENDER=0` solo genera el modelo. Desde terminal:

```bash
blender --background --python crear_torre_natalini.py
```

Los parámetros iniciales permiten cambiar número de niveles, alturas y piso provisional. Modificar el desplazamiento del departamento requiere recalibrar las coordenadas globales de cámaras y trayectoria; no es un sistema BIM asociativo.

Valores provisionales empleados: PB 4,80 m, tres niveles de podio de 3,20 m, 28 módulos de torre de 3,10 m y departamento situado en el módulo 5, a 29,90 m. Estos valores son decisiones de visualización, no alturas confirmadas del edificio. Altura interior 2,75 m; cámara peatonal a 1,65 m.

## Para cerrar una versión fiel al edificio

Se necesitan planta baja acotada, planta tipo con identificación del departamento, piso y orientación, altura entre losas, altura libre, detalles de carpinterías y fotos de palier/ascensor. Con esos datos se puede sustituir la conexión provisional, corregir el perímetro de torre y verificar superficies. El trabajo entregado sirve como base editable de visualización y revisión, no como certificación dimensional.

## Validación realizada

El proyecto se generó y abrió en Blender 4.5.3 LTS. Se renderizaron vistas exterior, de hall, estar y axonométrica del departamento. Se comprobó la trayectoria del centro de la cámara cada tres fotogramas y se corrigieron interferencias de las losas del podio y una discontinuidad del palier. El control final no encontró intersecciones en esos segmentos ni falta de piso en el tramo de entrada al departamento. Es un muestreo geométrico, no una prueba de colisión con volumen corporal.

Se verificaron seis cámaras y dieciséis imágenes empaquetadas. `verificacion.json` registra complejidad de malla y parámetros; `control_recorrido.json` registra el control de trayectoria. Los polígonos informados son caras base únicas, antes de modificadores e instancias evaluadas.
