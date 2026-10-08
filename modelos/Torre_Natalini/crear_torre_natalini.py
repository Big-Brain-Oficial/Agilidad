"""Torre Natalini: reconstrucción ArchViz interpretativa de las referencias.
Blender 4.5 LTS. Ejecutar en Scripting o: blender -b --python crear_torre_natalini.py
Las medidas no documentadas y la implantación son PROVISIONALES. No es un relevamiento.
"""
import bpy, math, os, json, random
from mathutils import Vector
from pathlib import Path
random.seed(104)
OUT=Path(os.environ.get('ARCHVIZ_OUTPUT', str(Path(__file__).resolve().parent)))
OUT.mkdir(parents=True,exist_ok=True)
P={'altura_pb':4.8,'altura_podio':3.2,'niveles_podio':3,'altura_tipo':3.1,
   'niveles_torre':28,'nivel_depto':5,'altura_interior':2.75,'offset_depto':(-7.5,0),
   'escala_plano_px_m':40.7,'ojo':1.65}
BASE=P['altura_pb']+P['niveles_podio']*P['altura_podio']
ZAPT=BASE+P['nivel_depto']*P['altura_tipo']
bpy.ops.wm.read_factory_settings(use_empty=True)
S=bpy.context.scene;S.name='NATALINI | Recorrido provisional'
S.unit_settings.system='METRIC';S.unit_settings.scale_length=1;S.unit_settings.length_unit='METERS'
S.render.engine='CYCLES';S.cycles.samples=24;S.cycles.use_denoising=True
S.render.resolution_x=1400;S.render.resolution_y=1000;S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG';S.render.fps=24;S.frame_end=1100
S.world=bpy.data.worlds.new('Cielo suave');S.world.use_nodes=True
S.world.node_tree.nodes['Background'].inputs[0].default_value=(.6,.72,.9,1)
S.world.node_tree.nodes['Background'].inputs[1].default_value=.45
S['AVISO']='Reconstrucción interpretativa. Nivel, núcleo, alturas y volumen general provisionales.'
S['PARAMETROS']=json.dumps(P)
COL={}
for n in ['00_REFERENCIAS','01_ENTORNO','02_PODIO','03_FACHADA_MODULAR','04_HALL','05_NUCLEO_PROVISIONAL','06_DEPTO_MUROS','07_DEPTO_ABERTURAS','08_DEPTO_MOBILIARIO','09_TECHOS','10_LUCES','11_CAMARAS','12_RECORRIDO','13_GUIAS']:
 c=bpy.data.collections.new(n);S.collection.children.link(c);COL[n]=c
ROOT=bpy.data.objects.new('EDIFICIO_CTRL',None);COL['13_GUIAS'].objects.link(ROOT)
APT=bpy.data.objects.new('DEPTO_CTRL | ubicación provisional',None);COL['13_GUIAS'].objects.link(APT)
APT.location=(*P['offset_depto'],ZAPT);APT.parent=ROOT
APT['piso_confirmado']=False;APT['superficie_publicada_m2']=97;APT['calibracion']='40.7 px/m sobre cotas legibles, sin forzar superficie total'

def put(o,col,parent=None):
 for c in list(o.users_collection):c.objects.unlink(o)
 COL[col].objects.link(o)
 if parent:o.parent=parent
 return o

def mat(n,c,rough=.5,metal=0,noise=0):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True
 nt=m.node_tree;bs=nt.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 if noise:
  tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=5
  ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(*[v*.67 for v in c],1);ramp.color_ramp.elements[1].color=(*[min(v*1.12,1) for v in c],1)
  nt.links.new(tex.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],bs.inputs['Base Color'])
  bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.15;bump.inputs['Distance'].default_value=noise;nt.links.new(tex.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs[0],bs.inputs['Normal'])
 return m
M={}
for n,c,r,mt,no in [('Hormigon',(.48,.46,.41),.83,0,.012),('Revoque',(.86,.85,.79),.75,0,.002),('Aluminio',(.075,.09,.092),.28,.75,0),('Piedra',(.67,.66,.59),.4,0,.008),('Madera',(.32,.16,.075),.48,0,.004),('Roble',(.49,.29,.13),.48,0,.003),('Marmol',(.79,.80,.76),.23,0,.007),('Oliva',(.22,.29,.16),.9,0,.006),('Lino',(.63,.49,.32),.92,0,.003),('Blanco',(.89,.9,.86),.3,0,0),('Negro',(.027,.032,.03),.42,0,0),('Metal',(.42,.47,.48),.24,.86,0),('Hojas',(.12,.22,.07),.8,0,0),('Tierra',(.085,.052,.024),1,0,0),('Asfalto',(.09,.105,.115),.9,0,.01)]:M[n]=mat(n,c,r,mt,no)
M['Vidrio']=mat('Vidrio claro',(.63,.78,.83),.12)
bs=M['Vidrio'].node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=1;bs.inputs['IOR'].default_value=1.45
M['VidrioTorre']=mat('Vidrio fachada azul gris',(.1,.22,.28),.2,.55)
M['Luz']=mat('LED cálido',(.95,.65,.27));bs=M['Luz'].node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.69,.34,1);bs.inputs['Emission Strength'].default_value=4

def box(n,loc,dims,ma='Revoque',col='06_DEPTO_MUROS',parent=None,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=dims
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);put(o,col,parent)
 o.data.materials.append(M[ma])
 if bevel:
  mod=o.modifiers.new('Cantos suaves','BEVEL');mod.width=bevel;mod.segments=2
  o.modifiers.new('Normales','WEIGHTED_NORMAL')
 return o

def cyl(n,loc,r,dep,ma,col,parent=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=r,depth=dep,location=loc);o=bpy.context.object;o.name=n;put(o,col,parent);o.data.materials.append(M[ma]);return o

def ell(n,loc,scale,ma,col,parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,location=loc);o=bpy.context.object;o.name=n;o.scale=scale;put(o,col,parent);o.data.materials.append(M[ma]);
 for p in o.data.polygons:p.use_smooth=True
 return o

def label(n,body,loc,size,col='13_GUIAS',parent=None):
 cu=bpy.data.curves.new(n,'FONT');cu.body=body;cu.size=size;cu.extrude=.0005;o=bpy.data.objects.new(n,cu);COL[col].objects.link(o);o.location=loc;o.parent=parent;cu.materials.append(M['Negro']);return o

def beam(n,a,b,w,ma,col,parent=None):
 a,b=Vector(a),Vector(b);o=box(n,(a+b)/2,(w,w,(b-a).length),ma,col,parent);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def camera(n,loc,target,lens=24,ortho=None):
 d=bpy.data.cameras.new(n);o=bpy.data.objects.new(n,d);COL['11_CAMARAS'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_end=1000
 if ortho:d.type='ORTHO';d.ortho_scale=ortho
 return o

def area(n,loc,energy,size,target,parent=None):
 d=bpy.data.lights.new(n,'AREA');d.energy=energy;d.shape='DISK';d.size=size;o=bpy.data.objects.new(n,d);COL['10_LUCES'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o.parent=parent;return o

def plant(x,y,z,r=.35,h=1.1,col='04_HALL',parent=None):
 cyl('Maceta',(x,y,z+.22),r,.44,'Negro',col,parent)
 cyl('Sustrato',(x,y,z+.45),r*.9,.02,'Tierra',col,parent)
 for i in range(7):
  a=i*2.4;ex=x+math.cos(a)*r*1.6;ey=y+math.sin(a)*r*1.6;ez=z+h*(.7+random.random()*.3)
  beam('Tallo',(x,y,z+.35),(ex,ey,ez),.022,'Hojas',col,parent)
  ob=ell('Hoja',(ex,ey,ez),(r*.7,r*.2,.09),'Hojas',col,parent);ob.rotation_euler[2]=a

def sofa(x,y,z,w,ma,col,parent=None,rot=0):
 root=bpy.data.objects.new('Sofa_CTRL',None);COL[col].objects.link(root);root.parent=parent;root.location=(x,y,z);root.rotation_euler.z=rot
 box('Base tapizada',(0,0,.31),(w,.86,.36),ma,col,root,.14)
 for i in range(3):
  xx=-w/2+(i+.5)*w/3
  box('Asiento',(xx,-.07,.52),(w/3-.04,.70,.22),ma,col,root,.1)
  box('Respaldo',(xx,.30,.80),(w/3,.25,.63),ma,col,root,.10)
 for xx in [-w/2,w/2]:box('Brazo',(xx,0,.57),(.23,.95,.42),ma,col,root,.1)
 return root

# ENTORNO / PODIO. Dimensiones deducidas visualmente, no relevadas.
box('Calle',(0,-7,-.22),(65,10,.22),'Asfalto','01_ENTORNO')
box('Vereda',(0,-1.6,-.12),(27,3.2,.24),'Piedra','01_ENTORNO')
box('Terreno',(0,7.5,-.28),(24,22,.25),'Piedra','01_ENTORNO')
for x in range(-12,13):box('Junta vereda',(x,-1.6,.005),(.015,3.2,.009),'Hormigon','01_ENTORNO')
box('PB losa',(0,7.5,-.10),(18,15,.20),'Marmol','02_PODIO')
for x in [-8.5,8.5]:
 for y in [0.4,5,10,14.5]:box('Columna PB',(x,y,2.4),(.52,.65,4.8),'Hormigon','02_PODIO',bevel=.015)
for k in range(4):
 z=P['altura_pb']+k*P['altura_podio']
 box('Losa podio frente',(0,4.05,z),(18.4,8.5,.28),'Hormigon','02_PODIO')
 box('Losa podio fondo',(0,13.45,z),(18.4,3.5,.28),'Hormigon','02_PODIO')
 for xx in [-5.25,5.25]:box('Losa podio lateral',(xx,10,z),(7.9,3.4,.28),'Hormigon','02_PODIO')
 if k<3:
  box('Frente podio',(0,.55,z+1.55),(17,.18,2.75),'VidrioTorre','02_PODIO')
  box('Jardinera frente',(0,-.12,z+.44),(17.8,.65,.65),'Hormigon','02_PODIO')
  for x in range(-8,9):
   ell('Vegetacion podio',(x,-.12,z+.98),(.65,.42,.56),'Hojas','02_PODIO')
  for x in [-8.2,8.2]:box('Lateral podio',(x,7.5,z+1.5),(.18,14,2.7),'VidrioTorre','02_PODIO')
# HALL inspirado en fotos, distribución esquemática.
box('Hall fondo izq',(-2.9,5.6,2.25),(.22,5.6,4.5),'Hormigon','04_HALL')
box('Hall lateral der',(3.2,3.7,2.25),(.2,7.4,4.5),'Marmol','04_HALL')
for x,w in [(-2.1,1.8),(2.3,1.6)]:box('Vidrio acceso',(x,.10,2.15),(w,.04,4.3),'Vidrio','04_HALL')
for x in [-3,-1.2,1.5,3.2]:box('Parante hall',(x,.10,2.15),(.07,.12,4.3),'Aluminio','04_HALL')
box('Dintel acceso',(.1,.1,4.3),(6.3,.15,.18),'Aluminio','04_HALL')
# Acceso abierto para recorrido.
for x in [-1.15,1.45]:box('Hoja acceso abierta',(x,.8,1.3),(.045,1.4,2.6),'Vidrio','04_HALL')
sofa(2.5,3.7,0,2.4,'Oliva','04_HALL',rot=math.pi/2)
sofa(-2.3,3.6,0,1.1,'Oliva','04_HALL',rot=-math.pi/2)
for x,y,r in [(1.1,3.9,.6),(1.5,3.1,.49)]:cyl('Mesa negra',(x,y,.40),r,.08,'Negro','04_HALL');cyl('Base mesa',(x,y,.2),.23,.37,'Negro','04_HALL')
plant(2.35,6.2,0,.36,2.8)
for j,c in enumerate([(.86,.25,.05),(.17,.43,.64),(.7,.65,.02)]):
 M['Arte'+str(j)]=mat('Arte '+str(j),c)
 box('Marco obra',(3.06,2.5+j*1.25,2.5),(.08,.66,.86),'Negro','04_HALL')
 box('Obra color',(3.00,2.5+j*1.25,2.5),(.035,.54,.74),'Arte'+str(j),'04_HALL')
box('LED zocalo',(3.05,3.7,.14),(.035,7,.035),'Luz','04_HALL')
# Conexión provisional a núcleo; hueco del ascensor en todas las losas.
box('Pasillo PB',(0,7.2,.01),(3.8,3,.04),'Marmol','05_NUCLEO_PROVISIONAL')
for x in [-1.2,1.2]:box('Muro caja ascensor',(x,10,(ZAPT+3)/2),(.18,3,ZAPT+3),'Hormigon','05_NUCLEO_PROVISIONAL')
box('Fondo caja ascensor',(0,11.5,(ZAPT+3)/2),(2.6,.18,ZAPT+3),'Hormigon','05_NUCLEO_PROVISIONAL')
# Cabina animada; puertas abiertas. Solo conexión visual, no mecánica certificada.
LIFT=bpy.data.objects.new('ASCENSOR_CTRL | animado',None);COL['05_NUCLEO_PROVISIONAL'].objects.link(LIFT);LIFT.location=(0,10,0)
for name,loc,dim in [('Suelo cabina',(0,0,.04),(2.18,2.75,.08)),('Techo cabina',(0,0,2.6),(2.18,2.75,.10)),('Fondo cabina',(0,1.32,1.3),(2.18,.04,2.6))]:box(name,loc,dim,'Metal','05_NUCLEO_PROVISIONAL',LIFT)
for x in [-1.07,1.07]:box('Lateral cabina',(x,0,1.3),(.04,2.7,2.6),'Metal','05_NUCLEO_PROVISIONAL',LIFT)
box('Luz cabina',(0,0,2.52),(1.5,1.5,.02),'Luz','05_NUCLEO_PROVISIONAL',LIFT)
area('Luz ascensor',(0,0,2.45),90,1.5,(0,0,0),LIFT)
for f,z in [(1,0),(400,0),(620,ZAPT),(1100,ZAPT)]:LIFT.location.z=z;LIFT.keyframe_insert(data_path='location',frame=f)
# Torre modular: mallas compartidas. Nivel con departamento evita envolvente duplicada.
module=[]
for k in range(P['niveles_torre']):
 z=BASE+k*P['altura_tipo']; special=k==P['nivel_depto']
 if k==0 or special:
  before=set(bpy.data.objects)
  # Losas partidas: hueco real de núcleo y apartamento.
  if special:
   box('Losa derecha nivel depto',(4.6,7.5,z-.14),(8.2,15,.28),'Hormigon','03_FACHADA_MODULAR')
   box('Losa posterior izq',(-4.5,12.2,z-.14),(6.8,5.6,.28),'Hormigon','03_FACHADA_MODULAR')
   box('Descanso frente ascensor',(-.9,7.7,z-.10),(4.1,1.8,.20),'Hormigon','05_NUCLEO_PROVISIONAL')
  else:
   box('Losa frente',(-.1,4.2,z-.14),(16.6,8.4,.28),'Hormigon','03_FACHADA_MODULAR')
   box('Losa posterior',(-.1,13.2,z-.14),(16.6,3.6,.28),'Hormigon','03_FACHADA_MODULAR')
   for x in [-4.7,4.7]:box('Losa lateral nucleo',(x,10,z-.14),(7,3.2,.28),'Hormigon','03_FACHADA_MODULAR')
  for x in [-8.3,8.3]:
   if special and x<0:continue
   box('Vidrio lateral',(x,7.5,z+1.42),(.055,14.8,2.82),'VidrioTorre','03_FACHADA_MODULAR')
   for y in range(0,16,2):box('Montante lateral',(x,y,z+1.45),(.11,.10,2.9),'Aluminio','03_FACHADA_MODULAR')
  for y in [0,15]:
   start=.7 if special and y==0 else -8.2;end=8.2
   box('Vidrio frente',((start+end)/2,y,z+1.42),(end-start,.055,2.8),'VidrioTorre','03_FACHADA_MODULAR')
   for x in [start+i*1.5 for i in range(int((end-start)/1.5)+1)]:box('Montante frente',(x,y,z+1.45),(.09,.12,2.9),'Aluminio','03_FACHADA_MODULAR')
  for x in [-8.5,8.5]:
   if special and x<0:continue
   box('Borde balcon',(x,1.2,z-.03),(1.25,3,.18),'Hormigon','03_FACHADA_MODULAR')
   box('Baranda balcon',(x,0,z+.62),(1.25,.045,1.15),'VidrioTorre','03_FACHADA_MODULAR')
  if k==0:module=list(set(bpy.data.objects)-before)
 else:
  for src in module:
   o=src.copy();o.data=src.data;COL['03_FACHADA_MODULAR'].objects.link(o);o.location.z+=k*P['altura_tipo'];o.name=src.name.split('.')[0]+f'_N{k:02d}'
for x in [-8.4,-5.6,1.8,5.5,8.4]:box('Nervio vertical',(x,-.10,BASE+P['niveles_torre']*3.1/2),(.22,.32,P['niveles_torre']*3.1),'Hormigon','03_FACHADA_MODULAR')
box('Coronamiento',(0,7.5,BASE+P['niveles_torre']*3.1),(17.3,15.4,.65),'Hormigon','03_FACHADA_MODULAR')


# Cierres del hall y sector posterior del nivel especial.
box('Hall cierre fondo izq',(-2.08,8.48,2.25),(1.56,.18,4.5),'Hormigon','04_HALL')
box('Hall cierre fondo der',(2.25,8.48,2.25),(1.9,.18,4.5),'Hormigon','04_HALL')
box('Hall dintel ascensor',(0,8.48,3.6),(2.6,.18,1.8),'Hormigon','04_HALL')
box('Hall lateral extendido',(3.2,7.98,2.25),(.2,1.16,4.5),'Marmol','04_HALL')
box('Hall vidrio lateral',(-2.9,1.4,2.2),(.035,2.8,4.4),'Vidrio','04_HALL')
box('Vidrio lateral posterior nivel depto',(-8.3,12,ZAPT+1.42),(.055,6,2.82),'VidrioTorre','03_FACHADA_MODULAR')

# DEPARTAMENTO: geometría trazada en el sistema de píxeles del plano adjunto.
def xy(p):return ((p[0]-83)/P['escala_plano_px_m'],(430-p[1])/P['escala_plano_px_m'])
def pb(n,px,py,z,dx,dy,dz,ma='Revoque',col='08_DEPTO_MOBILIARIO',bevel=0):
 x,y=xy((px,py));return box(n,(x,y,z),(dx,dy,dz),ma,col,APT,bevel)
def wall(n,a,b,h=2.75,t=.12,z=0,ma='Revoque',col='06_DEPTO_MUROS'):
 a,b=Vector(xy(a)),Vector(xy(b));o=box(n,((a.x+b.x)/2,(a.y+b.y)/2,z+h/2),((b-a).length,t,h),ma,col,APT);o.rotation_euler.z=math.atan2(b.y-a.y,b.x-a.x);return o

def opening(n,a,b,bottom=0,top=2.5,glass=True):
 aa,bb=Vector(xy(a)),Vector(xy(b));le=(bb-aa).length;mid=(aa+bb)/2;ang=math.atan2(bb.y-aa.y,bb.x-aa.x)
 for zz in [bottom,top]:
  o=box(n+' travesaño',(mid.x,mid.y,zz),(le,.07,.06),'Aluminio','07_DEPTO_ABERTURAS',APT);o.rotation_euler.z=ang
 count=max(1,round(le/1.15))
 for i in range(count+1):
  p=aa+(bb-aa)*i/count;box(n+' parante',(p.x,p.y,(bottom+top)/2),(.05,.05,top-bottom),'Aluminio','07_DEPTO_ABERTURAS',APT)
 if glass:
  o=box(n+' vidrio',(mid.x,mid.y,(bottom+top)/2),(le,.012,top-bottom),'Vidrio','07_DEPTO_ABERTURAS',APT);o.rotation_euler.z=ang

def door(n,a,b):
 opening(n,a,b,0,2.18,False);aa=xy(a);bb=xy(b);w=math.dist(aa,bb)
 # Hoja abierta junto al muro; no obstruye el recorrido.
 o=box(n+' hoja abierta',(aa[0]+.04,aa[1]+w/2,1.07),(.04,w,2.14),'Blanco','07_DEPTO_ABERTURAS',APT,.01)
 return o
# Suelo poligonal sin superficies duplicadas.
poly=[(83,65),(300,65),(300,132),(350,132),(350,145),(407,145),(407,430),(56,430),(56,289),(83,289)]
verts=[(*xy(p),-.04) for p in poly];me=bpy.data.meshes.new('Planta trazada');me.from_pydata(verts,[],[tuple(range(len(verts)-1,-1,-1))]);me.update();ob=bpy.data.objects.new('Suelo departamento | trazado',me);COL['06_DEPTO_MUROS'].objects.link(ob);ob.parent=APT;me.materials.append(M['Madera']);sol=ob.modifiers.new('Espesor','SOLIDIFY');sol.thickness=.12
# Tablones instanciados, recortados por zonas rectangulares.
for x1,x2,y1,y2 in [(86,239,69,174),(86,196,180,285),(201,300,233,285),(130,403,292,427),(303,347,146,292),(202,300,180,226)]:
 xa,ya=xy((x1,y2));xb,yb=xy((x2,y1));rows=int((yb-ya)/.18)
 for row in range(rows):
  yy=ya+(row+.5)*.18
  for j in range(3):
   width=(xb-xa)/3
   box('Tabla roble',(xa+(j+.5)*width,yy,.006),(width-.006,.174,.016),'Roble' if (row+j)%4==0 else 'Madera','08_DEPTO_MOBILIARIO',APT)
# Muros perimetrales y particiones; huecos resueltos por tramos.
for n,a,b,t in [('Norte',(83,65),(300,65),.18),('Este baño',(300,65),(300,132),.16),('Nicho entrada',(350,132),(350,145),.13),('Toilette norte',(350,145),(407,145),.13),('Este',(407,145),(407,430),.18),('Dormitorio principal',(242,65),(242,150),.12),('Dormitorio principal corto',(242,171),(242,177),.12),('Divisor dormitorios',(83,177),(200,177),.12),('Quiebre pasillo',(200,177),(200,230),.12),('Tabique dormitorio',(236,230),(300,230),.12),('Baño sur',(262,177),(300,177),.12),('Baño lateral',(300,145),(300,177),.12),('Dormitorio sur',(83,289),(300,289),.12),('Toilette sur',(350,209),(407,209),.12),('Toilette corto',(350,199),(350,209),.12),('Toilette lateral',(350,145),(350,164),.12)]:wall(n,a,b,t=t)
for n,a,b in [('Puerta dormitorio 1',(242,150),(242,171)),('Puerta dormitorio 2',(201,230),(236,230)),('Puerta baño',(242,177),(262,177)),('Puerta toilette',(350,164),(350,199)),('Entrada',(300,132),(350,132))]:
 door(n,a,b);wall(n+' dintel',a,b,h=.57,z=2.18)
# Fachadas vidriadas dos dormitorios y estar, con antepecho bajo.
for n,a,b in [('Ventana dormitorio 1',(83,69),(83,173)),('Ventana dormitorio 2',(83,181),(83,283)),('Ventanal estar',(130,430),(402,430))]:
 wall('Antepecho '+n,a,b,h=.22,t=.17,ma='Hormigon');opening(n,a,b,.22,2.57);wall('Viga '+n,a,b,h=.18,z=2.57,ma='Hormigon')
for a,b in [((83,65),(83,69)),((83,173),(83,181)),((83,283),(83,334)),((230,430),(260,430))]:wall('Pilar hormigon',a,b,t=.24,ma='Hormigon')
opening('Acceso balcon',(128,335),(128,425),0,2.55,False)
wall('Balcon lateral',(56,289),(56,430),h=.15,t=.12,ma='Hormigon');wall('Balcon frente',(56,430),(128,430),h=.15,t=.12,ma='Hormigon')
opening('Baranda balcon lateral',(56,289),(56,430),.15,1.1);opening('Baranda balcon frente',(56,430),(128,430),.15,1.1)
pb('Piso balcon',92,361,-.005,1.72,3.38,.04,'Piedra')
# Plafones separados para vista sin techo.
for x1,x2,y1,y2 in [(83,300,65,289),(300,407,145,430),(128,300,289,430)]:
 x,y=xy(((x1+x2)/2,(y1+y2)/2));box('Techo hormigon',(x,y,2.84),((x2-x1)/40.7,(y2-y1)/40.7,.18),'Hormigon','09_TECHOS',APT)
# Placares.
for px,py,w,d in [(224,109,.58,1.95),(267,260,1.55,1.32),(116,310,.5,.92)]:
 pb('Placard',px,py,1.22,w,d,2.44,'Blanco',bevel=.01)
 for dx in [-w/4,w/4]:
  x,y=xy((px,py));box('Manija placard',(x+dx,y-d/2-.02,1.15),(.018,.025,.34),'Metal','08_DEPTO_MOBILIARIO',APT)
# Camas y mesitas.
for px,py,w,l in [(151,112,1.5,1.95),(148,232,.95,1.9)]:
 x,y=xy((px,py));box('Cama base',(x,y,.24),(w,l,.38),'Roble','08_DEPTO_MOBILIARIO',APT,.05)
 box('Colchon',(x,y,.49),(w,l,.22),'Blanco','08_DEPTO_MOBILIARIO',APT,.08)
 box('Cubrecama',(x,y-.3,.61),(w+.015,l*.66,.055),'Lino','08_DEPTO_MOBILIARIO',APT,.025)
 for dx in ([-.38,.38] if w>1 else [0]):box('Almohada',(x+dx,y+.66,.65),(.58,.39,.14),'Blanco','08_DEPTO_MOBILIARIO',APT,.075)
 box('Respaldo cama',(x,y+l/2,.6),(w+.12,.08,1.15),'Roble','08_DEPTO_MOBILIARIO',APT,.02)
 box('Mesa de noche',(x-w/2-.28,y+.68,.26),(.42,.42,.5),'Roble','08_DEPTO_MOBILIARIO',APT,.02)
# Estar comedor y cocina lineal.
x,y=xy((190,320));sofa(x,y,0,2.3,'Lino','08_DEPTO_MOBILIARIO',APT)
x,y=xy((188,376));cyl('Mesa cafe',(x,y,.4),.48,.075,'Roble','08_DEPTO_MOBILIARIO',APT);cyl('Pie mesa cafe',(x,y,.19),.20,.38,'Negro','08_DEPTO_MOBILIARIO',APT)
pb('Alfombra',188,374,.03,2.45,1.75,.025,'Lino')
pb('Mueble TV',175,420,.32,1.55,.28,.6,'Roble');pb('Pantalla TV',175,426,1.16,1.35,.07,.78,'Negro')
x,y=xy((282,369));box('Mesa comedor',(x,y,.76),(1.0,1.75,.07),'Roble','08_DEPTO_MOBILIARIO',APT,.03)
for dx in [-.38,.38]:
 for dy in [-.65,.65]:box('Pata mesa',(x+dx,y+dy,.38),(.05,.05,.73),'Negro','08_DEPTO_MOBILIARIO',APT)
for dx in [-.78,.78]:
 for dy in [-.5,.5]:
  box('Asiento silla',(x+dx,y+dy,.45),(.45,.43,.10),'Lino','08_DEPTO_MOBILIARIO',APT,.05)
  box('Respaldo silla',(x+dx*1.2,y+dy,.74),(.08,.44,.57),'Lino','08_DEPTO_MOBILIARIO',APT,.04)
  for lx in [-.16,.16]:
   for ly in [-.16,.16]:box('Pata silla',(x+dx+lx,y+dy+ly,.22),(.028,.028,.44),'Negro','08_DEPTO_MOBILIARIO',APT)
for py in [265,290,315,340,365,390,415]:
 pb('Bajo mesada',392,py,.44,.61,.59,.86,'Blanco',bevel=.008)
 pb('Tirador cocina',378,py,.76,.025,.35,.025,'Aluminio')
pb('Mesada',391,337,.90,.65,4.34,.055,'Piedra',bevel=.008)
pb('Alacena',395,348,2.03,.40,3.45,.74,'Blanco',bevel=.008)
pb('Heladera',389,244,1.0,.72,.66,2.0,'Metal',bevel=.025)
pb('Bacha',390,316,.935,.43,.48,.025,'Metal',bevel=.08)
pb('Interior bacha',390,316,.945,.34,.39,.026,'Negro',bevel=.065)
x,y=xy((401,316));cyl('Grifo',(x,y,1.10),.022,.34,'Metal','08_DEPTO_MOBILIARIO',APT)
pb('Anafe',390,379,.943,.48,.57,.025,'Negro')
for px in [385,395]:
 for py in [373,384]:
  x,y=xy((px,py));cyl('Hornalla',(x,y,.966),.072,.02,'Metal','08_DEPTO_MOBILIARIO',APT)
pb('Barra',345,381,.99,.48,1.85,.07,'Roble')
for py in [365,400]:
 x,y=xy((333,py));cyl('Banqueta',(x,y,.68),.23,.08,'Lino','08_DEPTO_MOBILIARIO',APT);cyl('Pie banqueta',(x,y,.34),.025,.68,'Metal','08_DEPTO_MOBILIARIO',APT)
# Sanitarios y revestimientos.
for px,py,w,d in [(272,119,1.23,2.6),(378,177,1.23,1.43)]:pb('Solado baño',px,py,.014,w,d,.024,'Piedra')
for px,py in [(284,157),(391,195)]:
 pb('Vanitory',px,py,.42,.45,.58,.78,'Roble',bevel=.01);pb('Lavatorio',px,py,.84,.47,.6,.09,'Blanco',bevel=.06)
 x,y=xy((px,py));box('Espejo',(x+.23,y,1.58),(.025,.60,.74),'Metal','08_DEPTO_MOBILIARIO',APT)
for px,py in [(285,106),(390,167),(285,132)]:
 x,y=xy((px,py));ell('Sanitario',(x,y,.32),(.29,.22,.30),'Blanco','08_DEPTO_MOBILIARIO',APT);ell('Tapa sanitario',(x-.08,y,.53),(.30,.20,.045),'Blanco','08_DEPTO_MOBILIARIO',APT)
pb('Plato ducha',270,81,.04,1.15,.67,.08,'Piedra')
opening('Mampara',(246,96),(297,96),.07,2.2)
x,y=xy((94,371));plant(x,y,0,.19,.85,'08_DEPTO_MOBILIARIO',APT)
# Rodapiés sencillos en zonas opacas.
for a,b in [((83,65),(239,65)),((200,177),(200,230)),((83,289),(300,289))]:wall('Zocalo',a,b,h=.065,t=.135,ma='Blanco',col='08_DEPTO_MOBILIARIO')
# Luces y cámaras.
area('Hall techo',(0,3.5,4.3),650,4,(0,3.5,0));area('Hall acceso',(0,-1,3),450,3,(0,4,1.5))
for px,py in [(185,360),(270,360),(150,113),(140,235),(320,230)]:
 x,y=xy((px,py));area('Plafon depto',(x,y,2.66),90,1.2,(x,y,0),APT)
area('Luz ventanal',(-3,-3,ZAPT+2),850,6,(-3,3,ZAPT+1))
d=bpy.data.lights.new('Sol','SUN');d.energy=2.0;d.angle=.08;o=bpy.data.objects.new('Sol',d);COL['10_LUCES'].objects.link(o);o.rotation_euler=(math.radians(28),math.radians(-25),math.radians(-35))
CEXT=camera('01_EXTERIOR',(-112,-145,81),(0,7,52),48)
CHALL=camera('02_HALL',(0,-.8,1.65),(0,5,1.6),20)
CINT=camera('03_ESTAR',(-5.8,1.1,ZAPT+1.55),(-.5,3.5,ZAPT+1.5),20)
CTOP=camera('04_PLANTA',(-3.5,4.6,ZAPT+22),(-3.5,4.6,ZAPT),35,13)
CAX=camera('05_AXONOMETRICA',(-17,-14,ZAPT+19),(-3.3,4.3,ZAPT+.6),38,17)
WALK=camera('06_RECORRIDO',(0,-6,1.65),(0,3,1.65),21)
# Ruta por posiciones clave: trayecto ascensor vertical y transición horizontal a entrada.
route=[(1,(0,-6,1.65),(0,2,1.65)),(100,(0,1,1.65),(1.3,4.5,1.5)),(180,(0,3.5,1.65),(2.3,4.2,1.5)),(245,(0,5.8,1.65),(0,10,1.65)),(345,(0,9.6,1.65),(0,7.5,1.65)),(400,(0,9.6,1.65),(0,7.5,1.65)),(620,(0,9.6,ZAPT+1.65),(0,7.5,ZAPT+1.65)),(670,(0,8.05,ZAPT+1.65),(-1.5,7.2,ZAPT+1.65)),(710,(-1.50,8.05,ZAPT+1.65),(-1.5,6.5,ZAPT+1.65)),(770,(-1.50,6.4,ZAPT+1.65),(-1.5,3,ZAPT+1.65)),(850,(-1.5,3.1,ZAPT+1.65),(-4.5,2,ZAPT+1.4)),(940,(-1.50,2.6,ZAPT+1.65),(-5.7,1.6,ZAPT+1.2)),(1020,(-1.65,5.55,ZAPT+1.65),(-4,5.55,ZAPT+1.6)),(1100,(-2.65,5.55,ZAPT+1.65),(-5.4,7.7,ZAPT+1.3))]
WALK.rotation_mode='QUATERNION'
for f,pos,target in route:
 WALK.location=pos;WALK.rotation_quaternion=(Vector(target)-Vector(pos)).to_track_quat('-Z','Y');WALK.keyframe_insert(data_path='location',frame=f);WALK.keyframe_insert(data_path='rotation_quaternion',frame=f)
for anim in [WALK,LIFT]:
 if anim.animation_data:
  for fc in anim.animation_data.action.fcurves:
   for kp in fc.keyframe_points:kp.interpolation='LINEAR'
cu=bpy.data.curves.new('Trayecto de referencia','CURVE');cu.dimensions='3D';sp=cu.splines.new('POLY');sp.points.add(len(route)-1)
for pt,(_,pos,_) in zip(sp.points,route):pt.co=(*pos,1)
ob=bpy.data.objects.new('RUTA | calle hall ascensor depto',cu);COL['12_RECORRIDO'].objects.link(ob);ob.hide_render=True
for f,n in [(1,'CALLE'),(100,'ACCESO'),(180,'HALL'),(345,'ASCENSOR'),(400,'SUBIDA PROVISIONAL'),(620,'NIVEL DEPTO'),(770,'ENTRADA DEPTO'),(850,'ESTAR'),(1020,'DISTRIBUIDOR')]:S.timeline_markers.new(n,frame=f)
# Referencias empaquetadas, ocultas al render.
refdir=Path(__file__).resolve().parent/'referencias'
if not refdir.exists():refdir=Path(__file__).resolve().parent.parent/'upload'
for i,p in enumerate(sorted(refdir.glob('*.png'))):
 im=bpy.data.images.load(str(p));im.pack();o=bpy.data.objects.new('REF_'+p.stem,None);COL['00_REFERENCIAS'].objects.link(o);o.empty_display_type='IMAGE';o.data=im;o.location=(25+i%4*6,20+i//4*6,0);o.empty_display_size=5;o.hide_render=True
COL['00_REFERENCIAS'].hide_viewport=True;COL['00_REFERENCIAS'].hide_render=True
# Anotaciones sin render y documentación interna.
COL['13_GUIAS'].hide_render=True
readme='''TORRE NATALINI · V01 INTERPRETATIVA\n\nBasada en 16 referencias adjuntas. No es un modelo as-built.\nEscala: 1 unidad = 1 metro. Calibración del plano: 40.7 px/m.\n97 m² es superficie publicada, no superficie verificada por el trazado.\nEl piso, la orientación del departamento, las alturas y el núcleo son provisionales.\nColecciones 06-09: apartamento trazado y amoblado. 09_TECHOS se oculta para plantas.\n03_FACHADA_MODULAR usa mallas compartidas. No se modelan todos los interiores repetidos.\n06_RECORRIDO: cámara animada, 1100 fotogramas a 24 fps. Seleccionarla como cámara activa y reproducir.\nAscensor: cabina abierta animada; no simulación de puertas ni controlador interactivo.\nPara navegar: View > Navigation > Walk Navigation.\nNo se incorpora el frente de ladrillo rojizo como fachada principal: su relación no se confirma.\nRevisar GUIA_MODELO.md para medidas, decisiones y pendientes.\n'''
t=bpy.data.texts.new('LEEME_PRIMERO');t.write(readme)
script=bpy.data.texts.load(str(Path(__file__).resolve()));script.name='crear_torre_natalini.py'
S.frame_set(1);S.camera=CEXT
for screen in bpy.data.screens:
 for ar in screen.areas:
  if ar.type=='VIEW_3D':
   ar.spaces.active.region_3d.view_distance=145;ar.spaces.active.region_3d.view_location=(0,5,45)
S.render.filepath=str(OUT/'01_exterior.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Torre_Natalini_Interpretativa.blend'),compress=True)
# Datos comprobables de complejidad.
meshes=[o for o in S.objects if o.type=='MESH'];unique={o.data for o in meshes}
area2=abs(sum(verts[i][0]*verts[(i+1)%len(verts)][1]-verts[(i+1)%len(verts)][0]*verts[i][1] for i in range(len(verts))))/2
stats={'blender':bpy.app.version_string,'objetos_malla':len(meshes),'mallas_unicas':len(unique),'caras_base_unicas':sum(len(m.polygons) for m in unique),'superficie_trazada_m2':round(area2,2),'superficie_publicada_m2':97,'altura_depto_provisional_m':ZAPT,'fotogramas':1100,'fps':24,'parametros':P}
(OUT/'verificacion.json').write_text(json.dumps(stats,indent=2,ensure_ascii=False))
if os.environ.get('ARCHVIZ_RENDER','1')=='1':
 S.render.resolution_x=1100;S.render.resolution_y=850
 for cam,name,roof in [(CAX,'02_departamento_axon',False),(CINT,'03_estar',True),(CHALL,'04_hall',True),(CEXT,'01_exterior',True)]:
  S.camera=cam;COL['09_TECHOS'].hide_render=not roof
  # Vista de departamento aislada del resto del edificio para lectura espacial.
  hidden=[]
  if cam==CAX:
   for key in ['01_ENTORNO','02_PODIO','03_FACHADA_MODULAR','04_HALL','05_NUCLEO_PROVISIONAL']:
    COL[key].hide_render=True;hidden.append(key)
  S.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
  for key in hidden:COL[key].hide_render=False
 COL['09_TECHOS'].hide_render=False
print('ARCHVIZ_OK',json.dumps(stats))
