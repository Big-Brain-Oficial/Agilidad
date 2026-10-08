"""Exporta la Torre Natalini a GLB para la web (MARQ Experience).

Lo ejecuta scripts/build-model.mjs:
  blender -b <archivo.blend> --factory-startup --python scripts/blender/export_web.py -- <salida.glb>

Trabaja sobre la escena cargada en memoria y NO guarda el .blend original.

  1. Descarta referencias, luces, cámaras, recorrido y guías de Blender.
  2. Aplana la jerarquía conservando posiciones y aplica modificadores (biseles, espesores).
  3. Simplifica los materiales procedurales: el navegador no puede evaluar nodos de ruido.
  4. Une las piezas por zona + material: de ~2000 objetos a unas decenas (menos draw calls).
     Prefijo de nombre: COL__ = participa de las colisiones, VIS__ = solo visual.
  5. Agrega anclas (empties) con puntos clave para la app: inicio, bus, ascensor, zonas y luces.
  6. Exporta GLB con eje Y hacia arriba.
"""
import bpy
import json
import re
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else bpy.path.abspath('//torre-natalini.raw.glb')

S = bpy.context.scene
S.frame_set(1)
P = json.loads(S['PARAMETROS'])
BASE = P['altura_pb'] + P['niveles_podio'] * P['altura_podio']
ZAPT = BASE + P['nivel_depto'] * P['altura_tipo']

EXCLUDED = {'00_REFERENCIAS', '10_LUCES', '11_CAMARAS', '12_RECORRIDO', '13_GUIAS'}
ZONE_BY_COLLECTION = {
    '01_ENTORNO': 'entorno',
    '02_PODIO': 'podio',
    '03_FACHADA_MODULAR': 'fachada',
    '04_HALL': 'hall',
    '05_NUCLEO_PROVISIONAL': 'nucleo',
    '06_DEPTO_MUROS': 'depto',
    '07_DEPTO_ABERTURAS': 'depto',
    '08_DEPTO_MOBILIARIO': 'depto',
    '09_TECHOS': 'techos',
}
# Piezas decorativas o muy finas que no deben frenar al visitante.
NO_COLLISION = {
    'Hoja', 'Tallo', 'Vegetacion podio', 'Sustrato', 'Junta vereda', 'Tabla roble',
    'LED zocalo', 'Hornalla', 'Tirador cocina', 'Manija placard', 'Grifo',
}


def base_name(name):
    return re.sub(r'(_N\d\d)?(\.\d+)?$', '', name)


def slug(text):
    return re.sub(r'[^A-Za-z0-9]+', '_', text).strip('_')


# Todo visible y seleccionable, para poder operar sobre cualquier objeto.
def unhide(lc):
    lc.exclude = False
    lc.hide_viewport = False
    lc.collection.hide_viewport = False
    lc.collection.hide_select = False
    for child in lc.children:
        unhide(child)


unhide(bpy.context.view_layer.layer_collection)
for o in S.objects:
    o.hide_set(False)
    o.hide_viewport = False
    o.hide_select = False

collection_of = {o.name: (o.users_collection[0].name if o.users_collection else '') for o in S.objects}
lift = bpy.data.objects.get('ASCENSOR_CTRL | animado')
cabin_names = {c.name for c in lift.children} if lift else set()
if lift:
    lift.animation_data_clear()

# Luces de Blender: se exportan como anclas para recrearlas en la web.
light_anchors = []
for o in S.objects:
    if o.type == 'LIGHT' and o.get('web_light', True):
        direction = (o.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
        light_anchors.append({
            'name': o.name, 'location': o.matrix_world.translation.copy(), 'tipo': o.data.type,
            'energia': float(o.data.energy), 'color': list(o.data.color), 'direccion': list(direction),
        })

# Superficie del departamento (para la zona de "departamento muestra").
floor = bpy.data.objects.get('Suelo departamento | trazado')
floor_box = None
if floor:
    pts = [floor.matrix_world @ Vector(c) for c in floor.bound_box]
    floor_box = (Vector((min(p.x for p in pts), min(p.y for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts))))

# Aplanar jerarquía conservando la posición en el mundo.
world = {o: o.matrix_world.copy() for o in S.objects}
for o in S.objects:
    o.parent = None
for o, mw in world.items():
    o.matrix_world = mw

for o in list(S.objects):
    if collection_of[o.name] in EXCLUDED or o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)

meshes = list(S.objects)
for o in meshes:
    zone = 'ascensor' if o.name in cabin_names else ZONE_BY_COLLECTION.get(collection_of[o.name], 'otros')
    o['_zona'] = zone
    o['_colision'] = o.get('archviz_collide', zone != 'ascensor' and base_name(o.name) not in NO_COLLISION)

# Modificadores aplicados y datos de malla propios (la fachada comparte mallas entre pisos).
depsgraph = bpy.context.evaluated_depsgraph_get()
for o in meshes:
    if o.modifiers:
        evaluated = bpy.data.meshes.new_from_object(o.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
        o.modifiers.clear()
        o.data = evaluated
    elif o.data.users > 1:
        o.data = o.data.copy()

# Las texturas de imagen y sus normales se conservan. Los materiales AV_ ya son
# compatibles con glTF; solo se adapta el vidrio antiguo del exterior.
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if not bsdf:
        continue
    if m.name.startswith('Vidrio'):
        bsdf.inputs['Transmission Weight'].default_value = 0
        bsdf.inputs['Alpha'].default_value = 0.25 if 'claro' in m.name else 0.6
        if hasattr(m, 'surface_render_method'):
            m.surface_render_method = 'BLENDED'

# Unir por zona + material + colisión.
groups = {}
for o in meshes:
    mat = o.active_material.name if o.active_material else 'SinMaterial'
    groups.setdefault((o['_zona'], mat, bool(o['_colision']), bool(o.get('archviz_proxy', False))), []).append(o)

joined = []
for (zone, mat, collide, proxy), objs in sorted(groups.items()):
    active = objs[0]
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=active, object=active, selected_objects=objs, selected_editable_objects=objs):
            bpy.ops.object.join()
    active.name = f"{'PHY' if proxy else 'COL' if collide else 'VIS'}__{zone}__{slug(mat)}"
    joined.append(active.name)


# Anclas: empties que la app lee por nombre (coordenadas de Blender: Z arriba).
def anchor(name, loc, scale=(1, 1, 1), **props):
    e = bpy.data.objects.new(name, None)
    S.collection.objects.link(e)
    e.location = loc
    e.scale = scale
    for k, v in props.items():
        e[k] = v
    return e


# El visitante "baja" del MARQ Bus, estacionado junto al cordón, y mira hacia el acceso.
anchor('ANCLA__inicio', (-6.4, -1.4, 0))
anchor('ANCLA__acceso', (0.15, 0.4, 1.6))
anchor('ANCLA__bus', (-11.8, -4.75, -0.11))
anchor('ANCLA__ascensor', (0, 10, 0), niveles=[0.0, ZAPT], piso_depto=P['nivel_depto'])
anchor('ZONA__hall', (0.15, 4.29, 2.25), (3.05, 4.19, 2.25))
anchor('ZONA__ascensor', (0, 9.98, (ZAPT + 3) / 2), (1.02, 1.32, (ZAPT + 3) / 2))
# Palier: desde la puerta del departamento (y = 7.35) hasta el hueco del ascensor.
anchor('ZONA__palier', (-0.9, 7.98, ZAPT + 1.5), (2.05, 0.63, 1.5))
if floor_box:
    lo, hi = floor_box
    anchor('ZONA__depto', ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, ZAPT + 1.4), ((hi.x - lo.x) / 2, (hi.y - lo.y) / 2, 1.6))
if 'ARCHVIZ_BOUNDS' in S:
    bounds = json.loads(S['ARCHVIZ_BOUNDS'])
    lo, hi, offset = bounds['min'], bounds['max'], bounds['offset']
    anchor('ZONA__depto', (offset[0]+(lo[0]+hi[0])/2, offset[1]+(lo[1]+hi[1])/2, ZAPT+1.4),
           ((hi[0]-lo[0])/2, (hi[1]-lo[1])/2, 1.6))
    for view in json.loads(S['ARCHVIZ_VIEWS']):
        anchor('VISTA__'+view['id'], [offset[i]+view['position'][i] for i in range(3)],
               label=view['label'], target=[offset[i]+view['target'][i] for i in range(3)])
for i, light in enumerate(light_anchors):
    anchor(f"LUZ__{i:02d}__{slug(light['name'])}", light['location'], tipo=light['tipo'], energia=light['energia'],
           color=light['color'], direccion=light['direccion'])

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=False,
    use_visible=False,
    use_renderable=False,
    export_apply=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
    export_animations=False,
    export_extras=True,
    export_materials='EXPORT',
    export_texcoords=True,
    export_normals=True,
    export_tangents=True,
)

print('EXPORT_WEB_OK', json.dumps({'salida': OUT, 'mallas': len(joined), 'luces': len(light_anchors), 'altura_depto': ZAPT}))
for name in joined:
    print('  ', name)
