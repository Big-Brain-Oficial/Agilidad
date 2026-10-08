"""Renders de revisión reproducibles. No modifica ni guarda el archivo fuente."""
import bpy
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'modelos/Torre_Natalini/archviz-renders'
OUT.mkdir(exist_ok=True)
S=bpy.context.scene
S.render.engine='CYCLES'
S.cycles.samples=int(os.environ.get('ARCHVIZ_SAMPLES','64'))
S.render.resolution_x=int(os.environ.get('ARCHVIZ_WIDTH','1280'))
S.render.resolution_y=round(S.render.resolution_x*.625)
S.render.resolution_percentage=100
S.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences
for backend in ['OPTIX','CUDA','HIP']:
    try:
        prefs.compute_device_type=backend
        prefs.get_devices()
        devices=[d for d in prefs.devices if d.type!='CPU']
        if devices:
            for device in prefs.devices:device.use=device.type!='CPU'
            S.cycles.device='GPU'
            print('RENDER_DEVICE',backend,[d.name for d in devices],flush=True)
            break
    except Exception:
        pass
else:
    S.cycles.device='CPU'
    print('RENDER_DEVICE CPU',flush=True)
# Conserva el entorno fotográfico para iluminación/reflejos, pero muestra cielo al mirar afuera.
nt=S.world.node_tree
background=next(n for n in nt.nodes if n.type=='BACKGROUND')
output=next(n for n in nt.nodes if n.type=='OUTPUT_WORLD')
path=nt.nodes.new('ShaderNodeLightPath')
sky=nt.nodes.new('ShaderNodeTexSky');sky.sky_type='HOSEK_WILKIE';sky.sun_direction=(.4,-.6,.7);sky.turbidity=2.2
sky_background=nt.nodes.new('ShaderNodeBackground');sky_background.inputs['Strength'].default_value=.45
nt.links.new(sky.outputs['Color'],sky_background.inputs['Color'])
mix=nt.nodes.new('ShaderNodeMixShader')
nt.links.new(path.outputs['Is Glossy Ray'],mix.inputs[0])
nt.links.new(sky_background.outputs[0],mix.inputs[1]);nt.links.new(background.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],output.inputs[0])
names=os.environ.get('ARCHVIZ_CAMERAS','AV_01_estar,AV_02_materiales,AV_03_dormitorio').split(',')
for name in names:
    S.camera=bpy.data.objects[name]
    S.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    print('RENDER_OK',S.render.filepath,flush=True)
