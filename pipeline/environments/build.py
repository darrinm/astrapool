"""Rebuild the four room furnishing GLBs with Blender 5.x in background mode.
Run: blender --background --factory-startup --python pipeline/environments/build.py -- /path/to/pool
All dimensions are meters. No existing interactive Blender file is touched.
"""
import bpy, math, random, sys
from pathlib import Path
from mathutils import Vector
ROOT = Path(sys.argv[sys.argv.index('--') + 1])
OUT = ROOT / 'public' / 'environments'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(41)
bpy.context.preferences.filepaths.save_version = 0

def material(name, color, roughness=.5, metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness; p.inputs['Metallic'].default_value=metal
    return m

def finish(obj,name,mat):
    obj.name=name; obj.data.materials.append(mat)
    for p in obj.data.polygons: p.use_smooth=True
    return obj

def box(name,loc,size,mat,bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL'); mod.width=bevel; mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL'); mod.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,mat)

def cylinder(name,loc,r,depth,mat,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=loc)
    o=finish(bpy.context.object,name,mat)
    mod=o.modifiers.new('Edge radius','BEVEL'); mod.width=.005; mod.segments=2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def rod(name,a,b,r,mat,r2=None):
    mid=(Vector(a)+Vector(b))/2; o=cylinder(name,mid,r,(Vector(b)-Vector(a)).length,mat,r2)
    o.rotation_euler=(Vector(b)-Vector(a)).to_track_quat('Z','Y').to_euler(); return o

def sphere(name,loc,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=loc)
    o=finish(bpy.context.object,name,mat); o.scale=scale; return o

def table(x,y,stone,metal):
    cylinder('Weighted pedestal', (x,y,.025), .22,.05,metal)
    cylinder('Turned pedestal stem',(x,y,.29),.035,.55,metal)
    cylinder('Honed stone side table',(x,y,.58),.30,.035,stone)
    cylinder('Brass rim',(x,y,.56),.305,.015,metal)

def bench(x,y,leather,frame,button):
    box('Floating bench frame',(x,y,.26),(1.65,.57,.12),frame,.035)
    for dx in [-.7,.7]:
        for dy in [-.22,.22]: cylinder('Tapered bench foot',(x+dx,y+dy,.13),.025,.26,frame,.016)
    for i in range(3):
        xx=x+(i-1)*.54
        box('Individual tailored seat cushion',(xx,y,.365),(.53,.57,.16),leather,.065)
        for dx in [-.13,.13]:
            for dy in [-.13,.13]: sphere('Inset upholstery button',(xx+dx,y+dy,.442),(.011,.011,.003),button)

def sofa_back(x,y,leather,frame,button,rolled=False):
    for i in range(3):
        xx=x+(i-1)*.54
        back=box('Tailored back cushion',(xx,y+.25,.63),(.53,.17,.48),leather,.068)
        back.rotation_euler.x=math.radians(-8)
        if rolled:
            for dx in [-.12,.12]:
                for dz in [-.10,.10]: sphere('Deep back tuft',(xx+dx,y+.151,.63+dz),(.014,.006,.014),button)
    for dx in [-.89,.89]:
        if rolled:
            rod('Rolled leather arm',(x+dx,y-.28,.57),(x+dx,y+.30,.57),.10,leather)
            box('Leather arm apron',(x+dx,y,.41),(.17,.61,.27),leather,.06)
        else: box('Upholstered sofa arm',(x+dx,y,.45),(.17,.65,.40),leather,.045)
    if rolled:
        for i in range(31): sphere('Antique brass nailhead',(x-.75+i*.05,y-.292,.285),(.006,.004,.006),frame)

def lounge_chair(x,y,leather,frame):
    # Reclined upholstered panels over a continuous bent metal cradle.
    for dx in [-.30,.30]:
        rod('Sled front foot',(x+dx,y-.35,.025),(x+dx,y+.38,.025),.025,frame)
        rod('Angled sled upright',(x+dx,y+.3,.035),(x+dx,y+.2,.42),.02,frame)
    box('Rounded seat shell',(x,y,.32),(.73,.70,.09),frame,.045)
    seat=box('Sculpted seat cushion',(x,y-.015,.39),(.69,.66,.16),leather,.077)
    seat.rotation_euler.x=math.radians(-8)
    back=box('Reclining padded back',(x,y+.31,.66),(.69,.17,.62),leather,.078)
    back.rotation_euler.x=math.radians(-18)
    head=box('Floating head cushion',(x,y+.43,.90),(.53,.18,.15),leather,.07)
    head.rotation_euler.x=math.radians(-18)
    for dx in [-.38,.38]:
        arm=box('Cantilever arm',(x+dx,y+.04,.55),(.09,.53,.075),frame,.035)
        arm.rotation_euler.x=math.radians(-8)

def planter(x,y,ceramic,leaf,soil):
    cylinder('Thrown ceramic planter',(x,y,.23),.21,.46,ceramic,.28)
    cylinder('Recessed soil',(x,y,.442),.257,.016,soil)
    # Long sculpted agave leaves with curved profiles, tapered tips and a center ridge.
    for i in range(18):
        a=i*math.pi*2/11; length=.42+(i%4)*.1; rise=.20+(i%5)*.10
        verts=[]
        for j in range(7):
            t=j/6; radial=length*t; z=.45+rise*math.sin(t*math.pi*.75)
            width=.065*math.sin(math.pi*t)**.7
            for off,h in [(-width,0),(0,.014),(width,0)]:
                verts.append((x+math.cos(a)*radial-math.sin(a)*off,y+math.sin(a)*radial+math.cos(a)*off,z+h))
        faces=[]
        for j in range(6):
            for k in range(2): faces.append((j*3+k,j*3+k+1,(j+1)*3+k+1,(j+1)*3+k))
        me=bpy.data.meshes.new('Agave leaf mesh'); me.from_pydata(verts,[],faces); me.update()
        o=bpy.data.objects.new('Sculpted agave leaf',me); bpy.context.collection.objects.link(o); finish(o,o.name,leaf)

def cue_stand(x,y,wood,metal):
    cylinder('Cue stand foot',(x,y,.055),.23,.11,wood)
    cylinder('Cue stand collar',(x,y,.92),.21,.055,wood)
    rod('Cue stand center',(x,y,.08),(x,y,.92),.035,metal)
    for i in range(5):
        a=i*math.tau/5; dx=math.cos(a)*.14; dy=math.sin(a)*.14
        rod('Maple cue shaft',(x+dx,y+dy,.1),(x+dx*1.15,y+dy*1.15,1.44),.012,wood,.005)
        rod('Cue butt wrap',(x+dx,y+dy,.12),(x+dx,y+dy,.52),.013,metal)

for theme in ['corner','desert','tokyo','orbital']:
    # Factory startup is isolated from the user's open .blend. Only this script's scene is replaced.
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials):
        if not m.users: bpy.data.materials.remove(m)
    if theme=='corner':
        leather=material('Oxblood aniline leather',(.10,.025,.026),.42)
        frame=material('Patinated brass',(.31,.19,.07),.32,.72)
        stone=material('Warm marble',(.45,.40,.32),.34)
        wood=material('Oiled walnut',(.09,.041,.021),.44)
        button=material('Upholstery recess',(.028,.009,.008),.85)
        bench(.4,2.15,leather,frame,button); sofa_back(.4,2.15,leather,frame,button,True); table(-.9,2.15,stone,frame); cue_stand(2.6,1.8,wood,frame)
    elif theme=='desert':
        leather=material('Saddle leather',(.38,.17,.075),.65)
        wood=material('Solid pale oak',(.40,.27,.14),.65)
        stone=material('Honed travertine',(.61,.50,.36),.75)
        dark=material('Dark ceramic',(.17,.115,.07),.9)
        leaf=material('Agave sage',(.16,.22,.12),.83); soil=material('Earth',(.03,.021,.011),1)
        bench(.35,2.15,leather,wood,leather); table(-.95,2.15,stone,wood); planter(2.75,1.7,dark,leaf,soil)
    elif theme=='tokyo':
        leather=material('Charcoal outdoor leather',(.015,.024,.035),.42)
        frame=material('Blackened steel',(.014,.02,.028),.38,.7)
        stone=material('Basalt',(.07,.09,.11),.3)
        bench(.35,2.15,leather,frame,leather); sofa_back(.35,2.15,leather,frame,leather); table(-.95,2.15,stone,frame)
        ceramic=material('Fluted black ceramic',(.025,.034,.04),.48)
        leaf=material('Dark green foliage',(.024,.08,.035),.7); soil=material('Dark gravel',(.017,.018,.019),.9)
        planter(2.7,1.8,ceramic,leaf,soil)
    else:
        leather=material('Ivory technical upholstery',(.63,.61,.54),.66)
        frame=material('Satin titanium',(.37,.43,.45),.31,.78)
        stone=material('Pearl composite',(.59,.63,.64),.4)
        lounge_chair(-.1,2.15,leather,frame); lounge_chair(.9,2.15,leather,frame); table(-.95,2.15,stone,frame)
        box('Console tapered plinth',(2.65,1.65,.27),(.40,.44,.54),frame,.09)
        box('Observatory console',(2.65,1.65,.71),(.55,.54,.40),stone,.12)
        screen=material('Smoked console glass',(.006,.018,.025),.19,.25)
        box('Inset console surface',(2.65,1.65,.913),(.40,.40,.009),screen,.04)
    # Merge by material, retaining baked bevels but keeping GPU draw calls low.
    for mat in list(bpy.data.materials):
        objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.active_material==mat]
        if not objects: continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects: o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join()
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{theme}-furniture.glb'),export_format='GLB',use_active_scene=True,export_animations=False,export_apply=True,export_yup=True)
    # Retain an editable native source in addition to the reproducible script.
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'pipeline'/'environments'/f'{theme}.blend'))
    print(theme, 'triangles',sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'))
