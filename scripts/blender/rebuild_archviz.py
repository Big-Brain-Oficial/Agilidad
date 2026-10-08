"""Reconstrucción métrica y materiales PBR de Natalini. Blender 4.5 / 5.x.

Abre el original en memoria, nunca lo sobrescribe. archviz-plan.json es la
fuente de cotas; los parámetros no acotados permanecen explícitos.
"""
import bpy
import json
import math
import os
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'modelos/Torre_Natalini'
ASSETS = ROOT / 'public/archviz'
PLAN = json.loads((OUT / 'archviz-plan.json').read_text(encoding='utf-8'))
A = PLAN['assumptions']
S = bpy.context.scene
P = json.loads(S['PARAMETROS'])
Z = P['altura_pb'] + P['niveles_podio'] * P['altura_podio'] + P['nivel_depto'] * P['altura_tipo']
H = A['clearHeight']
OFFSET = Vector((*A['apartmentOffset'], Z))
random.seed(104)
S.frame_set(1)
P['altura_interior'] = H
P['archviz'] = True
S['PARAMETROS'] = json.dumps(P)
S['ARCHVIZ_PLAN'] = json.dumps(PLAN, ensure_ascii=False)
S['AVISO'] = A['note']
S.name = 'NATALINI | ArchViz métrico'
S.unit_settings.system = 'METRIC'
S.unit_settings.scale_length = 1

# El exterior y el ascensor siguen vinculados al recorrido existente.
for name in ['06_DEPTO_MUROS', '07_DEPTO_ABERTURAS', '08_DEPTO_MOBILIARIO', '09_TECHOS']:
    for obj in list(bpy.data.collections[name].objects):
        bpy.data.objects.remove(obj, do_unlink=True)
for obj in list(bpy.data.collections['10_LUCES'].objects):
    if obj.name != 'Luz ascensor':
        bpy.data.objects.remove(obj, do_unlink=True)
for obj in list(bpy.data.collections['04_HALL'].objects):
    if any(obj.name.startswith(n) for n in ['Sofa', 'Base tapizada', 'Asiento', 'Respaldo', 'Brazo', 'Mesa negra', 'Base mesa', 'Maceta', 'Sustrato', 'Tallo', 'Hoja']):
        bpy.data.objects.remove(obj, do_unlink=True)


def linear(hex_color):
    values = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def material(name, color, rough=.5, metal=0, asset=None, tile=1, diffuse=True, normal=.3, sheen=0):
    m = bpy.data.materials.new('AV_' + name)
    m.use_nodes = True
    m.diffuse_color = (*linear(color), 1)
    m['tile_m'] = tile
    nt = m.node_tree
    bs = nt.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = m.diffuse_color
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Sheen Weight'].default_value = sheen
    bs.inputs['Sheen Roughness'].default_value = .65
    if asset:
        for kind, socket in [('diff', 'Base Color'), ('rough', 'Roughness'), ('nor_gl', 'Normal')]:
            if kind == 'diff' and not diffuse:
                continue
            path = ASSETS / asset / (kind + '.jpg')
            if not path.exists():
                raise FileNotFoundError(path)
            image = bpy.data.images.load(str(path), check_existing=True)
            image.colorspace_settings.name = 'sRGB' if kind == 'diff' else 'Non-Color'
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.image = image
            tex.interpolation = 'Linear'
            if kind == 'nor_gl':
                bump = nt.nodes.new('ShaderNodeNormalMap')
                bump.inputs['Strength'].default_value = normal
                nt.links.new(tex.outputs['Color'], bump.inputs['Color'])
                nt.links.new(bump.outputs['Normal'], bs.inputs[socket])
            else:
                nt.links.new(tex.outputs['Color'], bs.inputs[socket])
    return m


M = {
    'oak': material('Roble', 'b69368', asset='wood_floor', tile=2.4, normal=.35),
    'concrete': material('Hormigon', 'a8a59e', .8, asset='concrete_wall_006', tile=2, normal=.26),
    'plaster': material('Revoque', 'efeee8', .83, asset='concrete_wall_006', tile=1.5, diffuse=False, normal=.045),
    'linen': material('Lino', 'c4ad8d', .88, asset='fabric_pattern_07', tile=.5, diffuse=False, normal=.42, sheen=.35),
    'ivory': material('Tela_marfil', 'e4dfd3', .9, asset='fabric_pattern_07', tile=.5, diffuse=False, normal=.38, sheen=.3),
    'olive': material('Tela_oliva', '707359', .92, asset='fabric_pattern_07', tile=.5, diffuse=False, normal=.38, sheen=.35),
    'rug': material('Alfombra', 'c7bfad', .97, asset='fabric_pattern_07', tile=.36, diffuse=False, normal=.6),
    'white': material('Laca_satinada', 'eaece8', .28),
    'stone': material('Piedra', 'c6c0b5', .67, asset='concrete_wall_006', tile=1.2, diffuse=False, normal=.14),
    'black': material('Grafito', '242627', .36),
    'counter': material('Granito_negro', '202324', .2, asset='concrete_wall_006', tile=.65, diffuse=False, normal=.045),
    'metal': material('Acero', 'a8aeb2', .23, 1),
    'aluminum': material('Aluminio', '52595d', .28, .85),
    'brass': material('Laton', 'b29460', .3, .85),
    'ceramic': material('Ceramica', 'e2dfd3', .28),
    'terracotta': material('Ceramica_terracota', '986548', .83),
}
M['glass'] = material('Vidrio', 'f5fcff', .055)
bs = M['glass'].node_tree.nodes.get('Principled BSDF')
bs.inputs['Transmission Weight'].default_value = 1
bs.inputs['IOR'].default_value = 1.5
M['light'] = material('Difusor', 'fff0d4', .6)
bs = M['light'].node_tree.nodes.get('Principled BSDF')
bs.inputs['Emission Color'].default_value = (1, .77, .46, 1)
bs.inputs['Emission Strength'].default_value = 3


def metric_uv(obj, tile):
    """UVs en metros, anteriores al bisel. Sin Generated ni UVs estiradas por escala."""
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name='UVMap')
    uv = mesh.uv_layers.active.data
    for face in mesh.polygons:
        axis = max(range(3), key=lambda a: abs(face.normal[a]))
        axes = (1, 2) if axis == 0 else (0, 2) if axis == 1 else (0, 1)
        for i in face.loop_indices:
            co = mesh.vertices[mesh.loops[i].vertex_index].co
            uv[i].uv = (co[axes[0]] / tile, co[axes[1]] / tile)


def place(obj, name, ma, col='08_DEPTO_MOBILIARIO', local=True, collide=False):
    obj.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    bpy.data.collections[col].objects.link(obj)
    if local:
        obj.location += OFFSET
    obj.data.materials.append(M[ma])
    obj['archviz_collide'] = collide
    return obj


def box(name, loc, size, ma='plaster', bevel=.008, col='08_DEPTO_MOBILIARIO', local=True, collide=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    metric_uv(obj, M[ma].get('tile_m', 1))
    place(obj, name, ma, col, local, collide)
    if bevel:
        mod = obj.modifiers.new('Microbisel', 'BEVEL')
        mod.width = min(bevel, min(size) * .45)
        mod.segments = 4
        mod = obj.modifiers.new('Normales ponderadas', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True
    return obj


def cylinder(name, loc, radius, depth, ma='oak', radius_top=None, local=True, col='08_DEPTO_MOBILIARIO'):
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=radius, radius2=radius if radius_top is None else radius_top, depth=depth, location=loc)
    obj = place(bpy.context.object, name, ma, col, local)
    metric_uv(obj, M[ma].get('tile_m', 1))
    for p in obj.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    mod = obj.modifiers.new('Borde pulido', 'BEVEL')
    mod.width = min(.004, depth * .2)
    mod.segments = 3
    obj.modifiers.new('Normales', 'WEIGHTED_NORMAL')
    return obj


def curve(name, points, radius, ma='metal', cyclic=False, local=True, col='08_DEPTO_MOBILIARIO'):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.resolution_u = 16
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for p, co in zip(sp.bezier_points, points):
        p.co = co
        p.handle_left_type = p.handle_right_type = 'AUTO'
    sp.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, cu)
    bpy.data.collections[col].objects.link(obj)
    if local:
        obj.location = OFFSET
    cu.materials.append(M[ma])
    obj['archviz_collide'] = False
    # El exportador recibe mallas, también para costuras y griferías.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    with bpy.context.temp_override(active_object=obj, object=obj, selected_objects=[obj], selected_editable_objects=[obj]):
        bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def cushion(name, loc, size, ma='linen', angle=0, local=True, col='08_DEPTO_MOBILIARIO'):
    """Superelipsoide: volumen acolchado, panza suave y pliegues cerca de costuras."""
    verts, faces = [], []
    rings, sectors = 24, 48
    power = .38
    signed = lambda v: math.copysign(abs(v) ** power, v)
    for j in range(rings + 1):
        v = -math.pi / 2 + math.pi * (j + .001) / (rings + .002)
        for i in range(sectors):
            u = 2 * math.pi * i / sectors
            x = size[0] / 2 * signed(math.cos(v)) * signed(math.cos(u))
            y = size[1] / 2 * signed(math.cos(v)) * signed(math.sin(u))
            wrinkle = .0028 * math.sin(u * 14 + j * .4) * abs(math.sin(v)) ** 3
            z = size[2] / 2 * signed(math.sin(v)) + wrinkle
            verts.append((x, y, z))
    for j in range(rings):
        for i in range(sectors):
            k = j * sectors + i
            nxt = j * sectors + (i + 1) % sectors
            faces.append((k, nxt, nxt + sectors, k + sectors))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    place(obj, name, ma, col, local)
    metric_uv(obj, M[ma].get('tile_m', .5))
    for p in mesh.polygons:
        p.use_smooth = True
    obj.rotation_euler.z = angle
    return obj


def proxy(name, loc, size, local=True, col='08_DEPTO_MOBILIARIO'):
    obj = box('Proxy ' + name, loc, size, 'black', 0, col, local, True)
    obj['archviz_proxy'] = True
    obj.hide_render = True
    obj.display_type = 'WIRE'
    return obj


def wall(name, a, b, bottom=0, top=H, thick=.12, ma='plaster', skirting=True):
    length = math.dist(a, b)
    obj = box(name, ((a[0]+b[0])/2, (a[1]+b[1])/2, (bottom+top)/2), (length, thick, top-bottom), ma, .004, '06_DEPTO_MUROS', collide=True)
    obj.rotation_euler.z = math.atan2(b[1]-a[1], b[0]-a[0])
    if skirting and bottom == 0:
        foot = box('Rodapie ' + name, ((a[0]+b[0])/2, (a[1]+b[1])/2, .038), (length, thick+.014, .075), 'white', .003)
        foot.rotation_euler.z = obj.rotation_euler.z
    return obj


def door(name, a, b):
    # Jambas de 25 mm y dintel: las hojas se dejan abiertas contra el tabique.
    width = math.dist(a, b)
    wall(name+' dintel', a, b, A['doorHeight'], H)
    angle = math.atan2(b[1]-a[1], b[0]-a[0])
    for p in [a, b]:
        obj = box(name+' jamba', (*p, 1.09), (.025, .15, 2.18), 'white', .003, '07_DEPTO_ABERTURAS')
        obj.rotation_euler.z = angle
    # No hoja ficticia dentro del hueco de circulación.
    return width


def window(name, a, b, bottom=.12, top=H-.14, rail=False, open_half=False):
    length = math.dist(a, b)
    angle = math.atan2(b[1]-a[1], b[0]-a[0])
    count = max(1, round(length / 1.22))
    if open_half:
        count = 2
    for height in [bottom, top] + ([] if rail else [1.05]):
        ob = box(name+' perfil horizontal', ((a[0]+b[0])/2, (a[1]+b[1])/2, height), (length, .058, .038), 'aluminum', .002, '07_DEPTO_ABERTURAS')
        ob.rotation_euler.z = angle
    for i in range(count+1):
        t = i/count
        if open_half and i == 1:
            continue
        box(name+' montante', (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, (bottom+top)/2), (.042, .042, top-bottom), 'aluminum', .002, '07_DEPTO_ABERTURAS')
    for i in range(count):
        if open_half and i == 0:
            continue
        t = (i+.5)/count
        ob = box(name+' vidrio', (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, (bottom+top)/2), (length/count-.048, .008, top-bottom-.035), 'glass', 0, '07_DEPTO_ABERTURAS', collide=True)
        ob.rotation_euler.z = angle


# Solados dimensionados individualmente; las etiquetas guardan las cotas verificables.
floors = []
for key, room in PLAN['rooms'].items():
    x, y = room['origin']
    w, d = room['width'], room['depth']
    floor = box('COTA__'+key, (x+w/2, y+d/2, -.065), (w, d, .13), 'stone' if key in ['balcony', 'bathroom', 'toilet'] else 'oak', 0, '06_DEPTO_MUROS', collide=True)
    floor['cota_m'] = [w, d]
    floor['fuente'] = PLAN['source']
    floors.append(floor)
    if key != 'balcony':
        box('Techo '+key, (x+w/2, y+d/2, H+.09), (w+.14, d+.14, .18), 'concrete', .002, '09_TECHOS', collide=True)
for x1, y1, x2, y2 in [(3.6, 3.54, 5.34, 4.84), (3.6, 4.84, 5.34, 6.42), (5.34, 3.4, 6.95, 7.45), (6.95, 3.35, 8.55, 5.2), (0, 2.5, 1.55, 3.54)]:
    box('Suelo circulacion', ((x1+x2)/2, (y1+y2)/2, -.065), (x2-x1, y2-y1, .13), 'oak', 0, '06_DEPTO_MUROS', collide=True)
    box('Techo circulacion', ((x1+x2)/2, (y1+y2)/2, H+.09), (x2-x1+.14, y2-y1+.14, .18), 'concrete', .002, '09_TECHOS', collide=True)
# Parches bajos bajo tabiques; eliminan fisuras sin alterar las cotas libres.
for x1, y1, x2, y2 in [(0, 6.24, 3.9, 6.42), (3.9, 6.17, 4.02, 9.12), (5.22, 6.17, 5.34, 9.12), (0, 3.4, 6.95, 3.54), (1.45, 0, 1.55, 2.5)]:
    box('Umbral continuo', ((x1+x2)/2, (y1+y2)/2, -.065), (x2-x1, y2-y1, .13), 'oak', 0, '06_DEPTO_MUROS', collide=True)

# Envolvente y tabiques. Las caras interiores coinciden con los rectángulos acotados.
wall('Norte dormitorios', (-.09, 9.21), (5.31, 9.21), thick=.18)
wall('Este baño', (5.28, 6.17), (5.28, 9.21))
wall('Separacion baño dormitorio', (3.96, 6.42), (3.96, 9.12))
wall('Divisor dormitorios', (0, 6.33), (2.95, 6.33), thick=.18)
door('Dormitorio principal', (2.95, 6.33), (3.77, 6.33))
wall('Jamba dormitorio principal', (3.77, 6.33), (3.96, 6.33), thick=.18)
wall('Quiebre dormitorio 2', (2.76, 4.78), (2.76, 6.24))
wall('Sur dormitorios', (0, 3.47), (5.28, 3.47), thick=.14)
wall('Placard lateral', (5.28, 3.54), (5.28, 4.78))
wall('Placard respaldo', (3.58, 4.78), (5.28, 4.78))
door('Dormitorio secundario', (2.76, 4.78), (3.58, 4.78))
wall('Baño sur tramo', (4.86, 6.11), (5.28, 6.11))
door('Baño', (4.08, 6.11), (4.86, 6.11))
wall('Baño sur jamba', (3.96, 6.11), (4.08, 6.11))
wall('Entrada tramo izquierdo', (5.28, 7.51), (5.48, 7.51))
door('Entrada', (5.48, 7.51), (6.38, 7.51))
wall('Entrada tramo derecho', (6.38, 7.51), (6.89, 7.51))
wall('Entrada lateral', (6.89, 6.66), (6.89, 7.57))
wall('Toilette norte', (6.89, 6.66), (8.34, 6.66))
wall('Toilette este', (8.31, 5.2), (8.31, 6.66))
wall('Toilette sur', (6.89, 5.14), (8.34, 5.14))
wall('Toilette jamba', (6.89, 5.14), (6.89, 5.42))
door('Toilette', (6.89, 5.42), (6.89, 6.20))
wall('Toilette tramo', (6.89, 6.20), (6.89, 6.66))
wall('Cocina este', (8.64, -.09), (8.64, 5.20), thick=.18)
wall('Nicho balcon', (-.06, 2.56), (1.49, 2.56))
wall('Balcon tramo opaco', (1.50, 2.10), (1.50, 3.4), thick=.1)
window('Corrediza balcon', (1.50, .06), (1.50, 2.10), bottom=.018, open_half=True)
window('Ventanal estar', (1.55, -.045), (8.55, -.045))
wall('Viga ventanal', (1.46, -.045), (8.64, -.045), H-.14, H, .18, 'concrete', False)
wall('Antepecho estar', (1.46, -.045), (8.64, -.045), 0, .10, .18, 'concrete', False)
for y1, y2 in [(3.54, 6.24), (6.42, 9.12)]:
    window('Ventana dormitorio', (-.045, y1), (-.045, y2))
    wall('Antepecho dormitorio', (-.045, y1), (-.045, y2), 0, .10, .18, 'concrete', False)
    wall('Viga dormitorio', (-.045, y1), (-.045, y2), H-.14, H, .18, 'concrete', False)
for y1, y2 in [(2.5, 3.54), (6.24, 6.42)]:
    wall('Pilar oeste', (-.045, y1), (-.045, y2), thick=.18, ma='concrete')
window('Baranda oeste', (-.035, 0), (-.035, 2.5), .08, 1.10, True)
window('Baranda frente', (0, -.035), (1.45, -.035), .08, 1.10, True)


def sofa(x, y, width=2.25, ma='linen', local=True, col='08_DEPTO_MOBILIARIO', rotation=0):
    before = set(S.objects)
    cushion('Sofa bastidor tapizado', (0, 0, .28), (width, .88, .28), ma, local=False, col=col)
    for sign in [-1, 1]:
        cushion('Sofa brazo curvo', (sign*(width/2-.10), -.01, .54), (.20, .91, .52), ma, local=False, col=col)
        cushion('Sofa asiento mullido', (sign*(width-.43)/4, -.075, .47), ((width-.43)/2-.015, .70, .20), ma, local=False, col=col)
        ob = cushion('Sofa respaldo', (sign*(width-.36)/4, .29, .75), ((width-.36)/2-.014, .24, .61), ma, local=False, col=col)
        ob.rotation_euler.x = -.11
        for yy in [-.30, .30]:
            cylinder('Sofa pata', (sign*(width/2-.20), yy, .10), .028, .20, 'black', local=False, col=col)
        pts = [(sign*(width-.43)/4 + .36*math.cos(t*math.tau/32), -.075+.285*math.sin(t*math.tau/32), .51) for t in range(32)]
        curve('Ribete asiento', pts, .002, ma, True, False, col)
    for xx, angle in [(-width*.31, -.16), (width*.30, .19)]:
        ob = cushion('Almohadon decorativo', (xx, .02, .76), (.43, .18, .43), 'ivory' if xx < 0 else 'olive', local=False, col=col)
        ob.rotation_euler = (-.18, angle, angle)
    proxy('sofa', (0, 0, .43), (width, .9, .86), False, col)
    for obj in set(S.objects)-before:
        vx, vy, vz = obj.location
        obj.location = (x+vx*math.cos(rotation)-vy*math.sin(rotation), y+vx*math.sin(rotation)+vy*math.cos(rotation), vz)
        obj.rotation_euler.z += rotation
        if local:
            obj.location += OFFSET


sofa(2.86, 2.90)
sofa(2.44, 3.8, 2.25, 'olive', False, '04_HALL', math.pi/2)
sofa(-2.28, 3.55, 1.05, 'olive', False, '04_HALL', -math.pi/2)
box('Alfombra estar', (2.99, 1.57, .012), (2.50, 2.38, .022), 'rug', .01)
table = cylinder('Mesa centro roble', (2.98, 1.60, .375), .47, .045)
table.scale.y = .73
for xx in [-.30, .30]:
    cylinder('Mesa centro patas', (2.98+xx, 1.60, .175), .095, .35, 'black')
cylinder('Mesa lateral', (1.76, 2.33, .52), .23, .035, 'stone')
cylinder('Mesa lateral pie', (1.76, 2.33, .25), .065, .5, 'black')


def import_asset(asset, loc, width=None, angle=0, col='08_DEPTO_MOBILIARIO', local=True):
    before = set(S.objects)
    bpy.ops.import_scene.gltf(filepath=str(ASSETS / asset / 'gltf.gltf'))
    objects = list(set(S.objects)-before)
    meshes = [o for o in objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    coords = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
    lo = Vector(tuple(min(v[i] for v in coords) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in coords) for i in range(3)))
    factor = width / (hi.x-lo.x) if width else 1
    pivot = Vector(((hi.x+lo.x)/2, (hi.y+lo.y)/2, lo.z))
    for obj in objects:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        bpy.data.collections[col].objects.link(obj)
        obj['archviz_collide'] = False
        obj['source'] = 'https://polyhaven.com/a/' + asset
        obj['license'] = 'CC0-1.0'
        v = (obj.location-pivot)*factor
        obj.location = (loc[0]+v.x*math.cos(angle)-v.y*math.sin(angle), loc[1]+v.x*math.sin(angle)+v.y*math.cos(angle), loc[2]+v.z)
        obj.rotation_euler.z += angle
        obj.scale *= factor
        if local:
            obj.location += OFFSET
    return objects


import_asset('modern_arm_chair_01', (4.0, .66, 0), .70, .38)
proxy('butaca', (4.0, .66, .40), (.72, .82, .80))
if (ASSETS/'potted_plant_02/gltf.gltf').exists():
    import_asset('potted_plant_02', (.60, 2.12, .02), .40)
    import_asset('potted_plant_02', (2.55, 6.15, 0), .8, col='04_HALL', local=False)
else:
    raise FileNotFoundError('Ejecutar npm run archviz:assets para descargar potted_plant_02')

# Mesa oval y sillas con carcasa continua curvada, canto y patas torneadas.
obj = cylinder('Comedor tapa oval roble', (5.42, 1.80, .75), .67, .045)
obj.scale.x = .75
for yy in [1.38, 2.22]:
    cylinder('Comedor pedestal', (5.42, yy, .36), .125, .72, 'oak', .08)
proxy('comedor', (5.42, 1.8, .38), (.98, 1.33, .76))


def chair(x, y, angle):
    before = set(S.objects)
    cushion('Silla asiento', (0, 0, .46), (.47, .45, .10), 'ivory', local=False)
    verts, faces = [], []
    for level in range(5):
        z = .48 + level*.095
        radius = .255+level*.003
        for i in range(33):
            a = math.pi*.10 + i/32*math.pi*.80
            verts.append((radius*math.cos(a), radius*math.sin(a)-.025 + level*.015, z))
    for j in range(4):
        for i in range(32):
            k=j*33+i
            faces.append((k, k+1, k+34, k+33))
    mesh=bpy.data.meshes.new('Carcasa silla')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj=bpy.data.objects.new('Silla respaldo envolvente', mesh)
    bpy.context.collection.objects.link(obj)
    place(obj, obj.name, 'ivory', local=False)
    metric_uv(obj, .5)
    for p in mesh.polygons:
        p.use_smooth=True
    sol=obj.modifiers.new('Tapizado espesor', 'SOLIDIFY')
    sol.thickness=.055
    bevel=obj.modifiers.new('Canto redondeado', 'BEVEL')
    bevel.width=.025
    bevel.segments=4
    for xx in [-.16, .16]:
        for yy in [-.15, .15]:
            curve('Pata silla roble', [(xx*1.14, yy*1.14, .015), (xx, yy, .26), (xx*.9, yy*.9, .44)], .022, 'oak', local=False)
    proxy('silla', (0, 0, .46), (.50, .50, .9), False)
    for obj in set(S.objects)-before:
        vx, vy, vz=obj.location
        obj.location=OFFSET+Vector((x+vx*math.cos(angle)-vy*math.sin(angle), y+vx*math.sin(angle)+vy*math.cos(angle), vz))
        obj.rotation_euler.z+=angle


for x,y,a in [(4.58,1.8,math.pi/2), (6.26,1.8,-math.pi/2), (5.42,.69,math.pi), (5.42,2.91,0)]:
    chair(x,y,a)

# Cocina: profundidad doméstica .60 m, frentes de 18 mm, zócalo retranqueado.
# La cocina acotada queda en 1.60 x 3.35 m; no se añade una barra que invada el paso.
for index in range(4):
    yy=.08+(.60/2)+index*.60
    box('Cocina carcasa', (8.24,yy,.48), (.56,.588,.76), 'white')
    if index == 1:
        box('Horno frente', (7.945,yy,.45), (.028,.55,.58), 'black', .008)
        box('Horno vidrio', (7.925,yy,.45), (.015,.43,.34), 'glass', .006)
        curve('Horno tirador', [(7.88,yy-.20,.70),(7.87,yy,.70),(7.88,yy+.20,.70)], .009)
        for dy in [-.15,.15]:
            ob=cylinder('Horno control', (7.91, yy+dy, .73), .017, .026, 'metal')
            ob.rotation_euler.y=math.pi/2
    else:
        for z, height in [(.28,.28),(.57,.27),(.78,.12)]:
            box('Cocina frente cajon', (7.941,yy,z), (.018,.578,height), 'white', .003)
            box('Cocina gola', (7.926,yy,z+height/2+.006), (.012,.55,.009), 'aluminum', .002)
    box('Cocina zocalo', (8.30,yy,.06), (.45,.60,.12), 'aluminum', .002)
    box('Alacena puerta', (8.17,yy,2.02), (.36,.587,.72), 'white', .003)
    box('LED bajo alacena', (7.99,yy,1.654), (.017,.57,.012), 'light', .001)
box('Mesada granito', (8.235,1.28,.886), (.63,2.45,.035), 'counter', .004)
box('Salpicadero granito', (8.535,1.28,1.01), (.024,2.45,.22), 'counter', .002)
box('Salpicadero blanco', (8.532,1.28,1.36), (.018,2.45,.47), 'white', .001)
box('Heladera panel', (8.20,2.99,1.03), (.66,.70,2.06), 'metal', .018)
box('Heladera puerta alta', (7.855,2.99,1.27), (.025,.67,1.49), 'white', .012)
box('Heladera freezer', (7.855,2.99,.255), (.025,.67,.49), 'white', .01)
proxy('cocina', (8.24,1.67,1.0), (.62,3.34,2.0))
# Bacha hundida: marco y cuatro paredes metálicas (no bloque negro sobre mesada).
box('Bacha fondo', (8.23,1.95,.901), (.42,.46,.008), 'black', .04)
for xx in [8.005,8.455]:
    box('Bacha borde', (xx,1.95,.91), (.018,.50,.018), 'metal', .004)
for yy in [1.70,2.20]:
    box('Bacha borde', (8.23,yy,.91), (.468,.018,.018), 'metal', .004)
curve('Grifo cuello cisne', [(8.46,2.23,.92),(8.46,2.23,1.19),(8.40,2.21,1.26),(8.23,2.16,1.25),(8.18,2.15,1.16)], .016)
box('Anafe vitroceramico', (8.22,.98,.910), (.48,.55,.012), 'black', .005)
for xx in [8.09,8.35]:
    for yy in [.84,1.12]:
        curve('Aro anafe', [(xx+.079*math.cos(i*math.tau/32), yy+.079*math.sin(i*math.tau/32), .918) for i in range(32)], .0015, 'aluminum', True)


def vase(x,y,z,r=.075,height=.21,ma='terracotta'):
    # Perfil torneado, cuello y labio reales.
    profile=[(.001,0),(.55*r,0),(.94*r,.05*height),(r,.25*height),(.8*r,.60*height),(.43*r,.82*height),(.42*r,height),(.34*r,height),(.32*r,.81*height)]
    verts=[]
    for rr,zz in profile:
        for i in range(64):
            a=i*math.tau/64
            verts.append((rr*math.cos(a),rr*math.sin(a),zz))
    faces=[]
    for j in range(len(profile)-1):
        for i in range(64):
            k=j*64+i; nxt=j*64+(i+1)%64
            faces.append((k,nxt,nxt+64,k+64))
    mesh=bpy.data.meshes.new('Ceramica torneada')
    mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('Jarron ceramica',mesh)
    bpy.context.collection.objects.link(obj);obj.location=(x,y,z)
    place(obj,obj.name,ma)
    for p in mesh.polygons:p.use_smooth=True


vase(5.42,1.80,.777,.09,.29)
vase(3.18,1.61,.401,.06,.15,'black')
vase(8.19,.29,.91,.064,.18,'ceramic')
for i,ma in enumerate(['olive','ivory']):
    ob=box('Libro mesa', (2.78,1.62,.409+i*.024), (.24,.18,.023), ma, .002)
    ob.rotation_euler.z=.10+i*.11
for x,y in [(5.42,1.35),(5.42,2.23)]:
    cylinder('Plato ceramica', (x,y,.787), .135, .009, 'ceramic')
    cylinder('Vaso vidrio', (x+.23,y,.84), .029, .12, 'glass')

# Luminaria escultórica, luz cálida contenida, sin bloom que lave los acabados.
for x,y,z,r in [(5.42,1.80,2.20,.26),(5.42,1.39,2.03,.18),(5.42,2.19,2.34,.17)]:
    cylinder('Cable colgante', (x,y,(H+z)/2), .003, H-z, 'black')
    cylinder('Pantalla conica', (x,y,z), r,.18,'ceramic',r*.42)
    cylinder('Difusor colgante', (x,y,z-.09), r*.92,.008,'light')


def bed(x,y,w=1.55,l=2.0):
    box('Cama base roble', (x,y,.205), (w,l,.27), 'oak', .035)
    cushion('Colchon', (x,y,.44), (w,l,.25), 'ivory')
    cushion('Respaldo tapizado cama', (x,y+l/2+.04,.64), (w+.16,.12,1.18), 'linen')
    # Tela colgada con caída lateral y pliegues geométricos, malla única.
    verts=[];faces=[];nx=46;ny=48
    for j in range(ny+1):
        v=j/ny
        yy=y-l*.5-.12+v*l*.78
        for i in range(nx+1):
            u=i/nx;xx=x+(u-.5)*(w+.22)
            edge=max(0,abs(xx-x)-w*.45)
            zz=.587-edge*1.6+.009*math.sin(u*math.pi*18+v*8)+.006*math.sin(v*29+u*8)
            if v<.055:zz-=.08*(1-v/.055)
            verts.append((xx,yy,zz))
    for j in range(ny):
        for i in range(nx):
            k=j*(nx+1)+i;faces.append((k,k+1,k+nx+2,k+nx+1))
    mesh=bpy.data.meshes.new('Ropa cama drapeada');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('Cubrecama drapeado',mesh);bpy.context.collection.objects.link(obj)
    place(obj,obj.name,'ivory');metric_uv(obj,.5)
    for p in mesh.polygons:p.use_smooth=True
    mod=obj.modifiers.new('Tela espesor','SOLIDIFY');mod.thickness=.006
    for dx in ([-w*.23,w*.23] if w>1.2 else [0]):
        cushion('Almohada cama', (x+dx,y+l*.34,.64), (min(w*.43,.65),.43,.16), 'ivory', .04 if dx>0 else -.05)
    proxy('cama', (x,y,.4), (w,l,.8))
    for xx in [x-w/2-.25,x+w/2+.25]:
        cylinder('Mesa noche', (xx,y+l*.33,.40), .18,.045,'oak')
        cylinder('Pie mesa noche', (xx,y+l*.33,.19), .055,.38,'black')
        vase(xx,y+l*.33,.423,.065,.15,'ceramic')


bed(1.62,7.80)
bed(1.38,4.75,1.0,1.9)
for x,y,w,d in [(3.60,8.28,.60,1.65),(4.71,4.12,.96,1.03)]:
    box('Placard cuerpo', (x,y,1.24), (w,d,2.48), 'white', .004)
    for yy in [y-d/4,y+d/4]:
        box('Placard frente', (x-w/2-.012,yy,1.24), (.018,d/2-.006,2.46), 'white', .003)
        curve('Placard manija', [(x-w/2-.04,yy,1.02),(x-w/2-.045,yy,1.23),(x-w/2-.04,yy,1.43)], .006)
    proxy('placard', (x,y,1.24), (w,d,2.48))

# Baños con revestimiento de junta fina, sanitarios suavizados y grifería curva.
for key in ['bathroom','toilet']:
    room=PLAN['rooms'][key];x,y=room['origin'];w,d=room['width'],room['depth']
    for j in range(math.ceil(d/.6)):
        for k in range(5):
            depth=min(.598,d-j*.6-.002)
            if depth<=0:continue
            box('Porcelanato pared', (x+w-.008,y+j*.6+depth/2,k*.55+.274), (.012,depth,.546), 'stone', .0015)
    xx=x+w-.265;yy=y+.48
    box('Vanitory suspendido', (xx,yy,.55), (.47,.58,.46), 'oak', .008)
    box('Lavatorio ceramico', (xx,yy,.822), (.49,.61,.085), 'ceramic', .035)
    box('Espejo', (x+w-.025,yy,1.48), (.012,.59,.89), 'metal', .018)
    curve('Griferia lavatorio', [(x+w-.10,yy,.85),(x+w-.10,yy,1.01),(x+w-.21,yy,1.02)], .011)
    sy=y+1.18 if key=='bathroom' else y+1.02
    cushion('Inodoro porcelana', (x+w-.38,sy,.27), (.59,.36,.49), 'ceramic')
    cushion('Inodoro asiento', (x+w-.40,sy,.49), (.58,.37,.045), 'white')
    box('Cisterna', (x+w-.095,sy,.64), (.15,.37,.39), 'ceramic', .055)
    proxy('sanitarios '+key, (x+w-.31,sy,.4), (.62,.4,.8))
    if key=='bathroom':
        box('Plato ducha', (x+w/2,y+d-.39,.025), (w-.03,.76,.05), 'stone', .005)
        window('Mampara ducha', (x+.58,y+d-.8), (x+w,y+d-.8), .08, 2.13, True)
        curve('Ducha tubo', [(x+w-.035,y+d-.40,1.0),(x+w-.035,y+d-.40,2.1),(x+w-.28,y+d-.40,2.15)], .011)
        cylinder('Rociador ducha', (x+w-.28,y+d-.40,2.13), .11,.015,'metal')

# Detalles arquitectónicos a escala, cortinas recogidas sin tapar la vista.
for x in [1.69,8.43]:
    verts=[];faces=[];nx=32;ny=20
    for j in range(ny+1):
        for i in range(nx+1):
            u=i/nx;v=j/ny
            verts.append((x+(u-.5)*.28,.13+.036*math.sin(u*math.tau*7),.08+v*(H-.20)))
    for j in range(ny):
        for i in range(nx):
            k=j*(nx+1)+i;faces.append((k,k+1,k+nx+2,k+nx+1))
    mesh=bpy.data.meshes.new('Pliegues cortina');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new('Cortina lino recogida',mesh);bpy.context.collection.objects.link(obj)
    place(obj,obj.name,'ivory');metric_uv(obj,.5)
    for p in mesh.polygons:p.use_smooth=True
    mod=obj.modifiers.new('Tejido espesor','SOLIDIFY');mod.thickness=.001
for x,y,rot in [(5.12,3.392,0),(3.575,5.3,math.pi/2),(5.32,6.0,math.pi/2)]:
    ob=box('Toma electrico', (x,y,.30), (.075,.009,.08), 'white', .003);ob.rotation_euler.z=rot

# Un techo continuo elimina solapes coplanares en encuentros de ambientes.
for obj in list(bpy.data.collections['09_TECHOS'].objects):
    bpy.data.objects.remove(obj,do_unlink=True)
outline=[(-.09,-.09),(8.73,-.09),(8.73,5.20),(8.40,5.20),(8.40,6.72),(7.01,6.72),(7.01,7.57),(5.40,7.57),(5.40,9.30),(-.09,9.30)]
mesh=bpy.data.meshes.new('Losa continua')
mesh.from_pydata([(x,y,H+.18) for x,y in outline],[],[tuple(range(len(outline)))])
mesh.update()
roof=bpy.data.objects.new('Techo continuo hormigon',mesh);bpy.context.collection.objects.link(roof)
place(roof,roof.name,'concrete','09_TECHOS',collide=True)
metric_uv(roof,2)
solid=roof.modifiers.new('Espesor losa','SOLIDIFY');solid.thickness=.18;solid.offset=-1
# Recorta la losa vecina para evitar doble solado dentro de la cocina.
for obj in S.objects:
    if obj.name.startswith('Losa derecha nivel depto'):
        right=8.70;left=OFFSET.x+8.73
        obj.location.x=(left+right)/2;obj.dimensions.x=right-left

# Retexturizar también las superficies conservadas del hall/exterior.
replace={'Hormigon':'concrete','Revoque':'plaster','Madera':'oak','Roble':'oak','Piedra':'stone','Marmol':'stone','Metal':'metal','Aluminio':'aluminum','Oliva':'olive','Lino':'linen','Blanco':'white'}
for obj in list(S.objects):
    if obj.type!='MESH' or 'archviz_collide' in obj:continue
    modified=False
    for slot in obj.material_slots:
        if slot.material and slot.material.name in replace:
            slot.material=M[replace[slot.material.name]];modified=True
    if modified and obj.active_material:
        # Las mallas repetidas de fachada conservan UV y escala de su módulo.
        metric_uv(obj,obj.active_material.get('tile_m',1))


def area(name, loc, target, energy, size, color=(1,.89,.74), local=True, web=True):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);bpy.data.collections['10_LUCES'].objects.link(obj)
    obj.location=Vector(loc)+(OFFSET if local else Vector())
    aim=Vector(target)+(OFFSET if local else Vector())
    obj.rotation_euler=(aim-obj.location).to_track_quat('-Z','Y').to_euler()
    obj['web_light']=web
    return obj


area('AV estar',(3.0,1.8,H-.18),(3,1.8,0),65,2.5)
area('AV cocina',(7.55,1.5,H-.16),(7.5,1.5,0),80,2)
area('AV noche',(1.8,7.6,H-.15),(1.8,7.6,0),55,2)
area('AV dormitorio 2',(1.5,4.7,H-.15),(1.5,4.7,0),50,1.6)
area('AV distribuidor',(5.9,5.5,H-.15),(5.9,5.5,0),35,1.2)
area('AV baño',(4.6,7.2,H-.1),(4.6,7.2,0),40,.7)
area('AV toilette',(7.6,5.9,H-.1),(7.6,5.9,0),30,.5)
area('AV hall',(0,3.5,4.15),(0,3.5,0),420,4,local=False)
# Solo Cycles: estos paños exteriores simulan entrada de luz, no luces en cada mueble.
area('Ventana difusa',(4,-1.2,2.5),(4,2,1),380,6,(.83,.91,1),web=False)
area('Ventana dormitorios',(-1.4,7,2.0),(2,7,1),260,4,(.84,.92,1),web=False)
sun_data=bpy.data.lights.new('Sol','SUN');sun_data.energy=2.1;sun_data.angle=math.radians(4)
sun=bpy.data.objects.new('Sol',sun_data);bpy.data.collections['10_LUCES'].objects.link(sun)
sun.rotation_euler=(math.radians(28),math.radians(-24),math.radians(-35))

# HDR para reflexión real; sRGB solo en albedo, normales/rugosidad como datos lineales.
S.world.use_nodes=True
nt=S.world.node_tree;nt.nodes.clear()
env=nt.nodes.new('ShaderNodeTexEnvironment')
env.image=bpy.data.images.load(str(ASSETS/'rooftop_day/hdri.hdr'),check_existing=True)
background=nt.nodes.new('ShaderNodeBackground');background.inputs['Strength'].default_value=.38
output=nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(env.outputs['Color'],background.inputs['Color']);nt.links.new(background.outputs[0],output.inputs[0])


def camera(name,loc,target,lens=24):
    data=bpy.data.cameras.new(name);data.lens=lens;data.clip_end=1000
    obj=bpy.data.objects.new(name,data);bpy.data.collections['11_CAMARAS'].objects.link(obj)
    obj.location=OFFSET+Vector(loc)
    obj.rotation_euler=(OFFSET+Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj


camera('AV_01_estar',(1.95,.46,1.55),(6.05,2.33,1.35),22)
camera('AV_02_materiales',(7.1,3.06,1.62),(2.45,1.52,1.26),24)
camera('AV_03_dormitorio',(3.15,6.65,1.55),(1.5,8.16,1.05),24)
S.camera=bpy.data.objects['AV_01_estar']
S.render.engine='CYCLES'
S.cycles.samples=128
S.cycles.use_denoising=True
S.cycles.adaptive_threshold=.015
S.cycles.max_bounces=10
S.cycles.diffuse_bounces=5
S.cycles.glossy_bounces=5
S.cycles.transmission_bounces=8
S.render.resolution_x=1600;S.render.resolution_y=1000;S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG'
S.view_settings.view_transform='AgX'
S.view_settings.exposure=.55
S.render.film_transparent=False
S['ARCHVIZ_BOUNDS'] = json.dumps({'min':[-.09,-.09], 'max':[8.73,9.3], 'offset':list(OFFSET)})
S['ARCHVIZ_VIEWS'] = json.dumps([
    {'id':'estar','label':'Estar y comedor','position':[2.1,.72,0], 'target':[5.5,2.15,1.45]},
    {'id':'cocina','label':'Cocina','position':[7.18,3.8,0], 'target':[8.2,1.5,1.3]},
    {'id':'dormitorio','label':'Dormitorio principal','position':[2.75,6.85,0], 'target':[1.4,8.2,1.15]},
    {'id':'segundo','label':'Segundo dormitorio','position':[2.75,3.96,0], 'target':[1.15,5.1,1.15]},
    {'id':'balcon','label':'Balcón','position':[.68,1.1,0], 'target':[.7,-4,1.5]},
])
# Verificación geométrica de las superficies realmente creadas.
checks=[]
for key,room in PLAN['rooms'].items():
    obj=bpy.data.objects['COTA__'+key]
    measured=[round(obj.dimensions.x,5),round(obj.dimensions.y,5)]
    expected=[room['width'],room['depth']]
    if any(abs(a-b)>.0001 for a,b in zip(measured,expected)):
        raise AssertionError((key,measured,expected))
    checks.append({'id':key,'expected':expected,'measured':measured,'source':PLAN['source']})
report={'units':'m','dimensionChecks':checks,'assumptions':A,'netAreaNotCertified':True,'publishedArea':97,'blender':bpy.app.version_string}
(OUT/'archviz-verification.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
S.frame_set(1)
# Recursos empaquetados para que el archivo de autoría sea transportable.
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Torre_Natalini_ArchViz.blend'),compress=True)
print('ARCHVIZ_REBUILD_OK',json.dumps({'rooms':len(checks),'objects':len(S.objects),'height':H}))
