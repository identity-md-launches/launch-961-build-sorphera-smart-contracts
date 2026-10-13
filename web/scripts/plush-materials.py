"""Reconstruct one continuous felt surface, preserving the approved photograph.

Python 3 + Pillow, numpy, scipy. Deterministic source-derived texture synthesis:
large overlapping, randomly selected photo patches (no mirrored tiles), sampled
through three spherical projections. Geography is a signed-distance continuation,
not alpha-blended continents. Colour, fibres, bevels, contact shade and physical
panel grooves share one material at every longitude, including the UV join/poles.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates, distance_transform_edt, binary_fill_holes, binary_closing
from PIL import ImageDraw
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/brand/plush'
photo = np.array(Image.open(ROOT / 'artwork/plush-source.webp').convert('RGB'), dtype=np.float32)
W,H=2048,1024
u,v=np.meshgrid((np.arange(W)+.5)/W,(np.arange(H)+.5)/H)
lon,lat=(u-.5)*2*np.pi,(.5-v)*np.pi
x,y,z=np.sin(lon)*np.cos(lat),np.sin(lat),np.cos(lon)*np.cos(lat)
rad=np.sqrt(x*x+(y-.005)**2)
transition=np.clip((rad-.34)/.18,0,1)
scale=1+.09*(1-transition*transition*(3-2*transition))
px,py=625+564*x/scale,615-573*y/scale
front=np.stack([map_coordinates(photo[:,:,c],[py,px],order=1,mode='nearest') for c in range(3)],-1)
pink=(front[:,:,0]>front[:,:,2]*1.05)
badge=(rad<.365)&(z>.85)
pink[badge]=False
geo=Image.new('L',(W,H));draw=ImageDraw.Draw(geo)
for ring in json.loads((ROOT/'src/earth-land.json').read_text()):
    for shift in [-360,0,360]:
        draw.polygon([((a+25+shift+180)/360*W,(90-b)/180*H) for a,b in ring],fill=255)
# Simplify tiny jagged geographic edges to sewn, rounded felt applique.
geo=np.asarray(geo)>127
geo=gaussian_filter(geo.astype(float),2.4,mode=('nearest','wrap'))>.42

def signed(mask):
    # Three copies make the distance field periodic at the dateline.
    tiled=np.tile(mask,(1,3))
    return (distance_transform_edt(tiled)-distance_transform_edt(~tiled))[:,W:2*W]
photo_land=gaussian_filter(pink.astype(float),1)>.5
weight=np.clip((z+.18)/.42,0,1);weight=weight*weight*(3-2*weight)
field=signed(geo)*(1-weight)+signed(photo_land)*weight
land=np.clip(.5+field/2.8,0,1)
land[badge]=0
# Retain all front detail through the broad face, with a material-level blend
# near the silhouette; the silhouette no longer introduces a different cloth.
fw=np.clip((z-.50)/.22,0,1);fw=fw*fw*(3-2*fw)
ref_light=.72+.18*x+.30*y+.10*np.maximum(0,z)

# Derive an illumination-neutral ocean fibre library from many clean pixels.
ph,pw=photo.shape[:2];sy,sx=np.mgrid[:ph,:pw]
fx=(sx-625)/564;fy=(615-sy)/573
fz=np.sqrt(np.maximum(0,1-fx*fx-fy*fy))
source_light=.72+.18*fx+.30*fy+.10*np.maximum(0,fz)
source=photo/source_light[:,:,None]
valid=(fx*fx+fy*fy<.83**2)&(fx*fx+(fy-.005)**2>.45**2)&(photo[:,:,2]>photo[:,:,0]*1.18)
# Local normalization removes lighting and stitched seams; actual fibre detail
# is retained rather than replaced by noise. Patch centres are never mirrored.
lum=source.mean(2); texture=lum/np.maximum(1,gaussian_filter(lum,9))
valid &= (texture>.6)&(texture<1.5)
centres=np.argwhere(distance_transform_edt(valid)>17)
rng=np.random.default_rng(96107)
N=1152;step=20;patch=40
acc=np.zeros((N+patch,N+patch));den=np.zeros_like(acc)
window=np.outer(np.hanning(patch),np.hanning(patch))
for yy in range(0,N,step):
    for xx in range(0,N,step):
        cy,cx=centres[rng.integers(len(centres))]
        # Random rotations preserve fibre scale while avoiding any repeating
        # motif, grid or diamond. Smooth overlap partitions unity.
        tile=np.rot90(texture[cy-20:cy+20,cx-20:cx+20],int(rng.integers(4)))
        acc[yy:yy+patch,xx:xx+patch]+=tile*window
        den[yy:yy+patch,xx:xx+patch]+=window
atlas=(acc/np.maximum(den,1e-6))[20:N-20,20:N-20]
# Sphere-space projections avoid equirectangular fibre pinching at the poles.
# Disjoint atlas coordinates and a mild smooth warp prevent visible repetition.
def sample(a,b,offset):
    sz=atlas.shape[0];aa=(a*.36+.5)*sz+offset+np.sin(b*11+a*5)*8
    bb=(b*.36+.5)*sz+np.sin(a*9-b*4)*7
    return map_coordinates(atlas,[bb,aa],order=1,mode='nearest')
wts=np.stack([abs(x)**12,abs(y)**12,abs(z)**12],-1);wts/=wts.sum(2)[:,:,None]
fibre=sample(z,y,-47)*wts[:,:,0]+sample(x,z,0)*wts[:,:,1]+sample(x,y,43)*wts[:,:,2]
fibre=1+(fibre-1)*1.75
# Match the real front's intrinsic material near the blend, by material class.
def material_color(mask):
    region=(z>.45)&(z<.75)&mask&(~badge)
    return np.median((front/ref_light[:,:,None])[region],axis=0)
ocean=material_color(~pink);applique=material_color(pink)
back=(ocean[None,None,:]*(1-land[:,:,None])+applique[None,None,:]*land[:,:,None])*fibre[:,:,None]
# Constant physical thickness: bevel distance measured in angular surface units.
inside=np.maximum(0,field);outside=np.maximum(0,-field)
bevel=np.clip(inside/7,0,1);bevel=bevel*bevel*(3-2*bevel)
shadow=np.exp(-(outside/8.0)**2)*(field<0)
back*=1-shadow[:,:,None]*.36
# Rounded contact edge with gently lit upper rim, not a flat painted continent.
bh=gaussian_filter(bevel,1.1,mode=('nearest','wrap'))
gy,gx=np.gradient(bh)
edge_light=np.clip(-gy*.65-gx*.35,-.13,.13)
back*=1+edge_light[:,:,None]
# Six stitched longitudinal panels and latitude joins, with no crossed grid
# of duplicated photo patches. The actual front stitching stays photographic.
meridian=np.abs(np.sin(lon*3))*np.cos(lat)
parallel=np.minimum(abs(lat+.58),np.minimum(abs(lat-.76),abs(lat+.025)))
# Small sewn pole caps keep converging panels from becoming a radial star.
meridian=np.where(np.cos(lat)>.22,meridian,1.)
parallel=np.minimum(parallel,abs(abs(lat)-1.35))
seam_distance=np.minimum(meridian,parallel)
seam=np.exp(-(seam_distance/.008)**2)*(1-land)
thread=np.exp(-(seam_distance/.0065)**2)
dash=np.where(meridian<parallel, np.sin(lat*95), np.sin(lon*95*np.cos(lat)))>-.12
back*=1-seam[:,:,None]*.22
back=back*(1-(thread*dash*(1-land)*.52)[:,:,None])+np.array([213,208,200])*(thread*dash*(1-land)*.52)[:,:,None]
# Remove the source photograph's rim-light from the blend only. Preserve the
# central approved front and every fibre; normalize broad illumination by cloth
# class so a moving side cannot expose a bright photographic transition band.
intrinsic=front/ref_light[:,:,None]
matched=np.zeros_like(front)
for mask, base in [(pink,applique),(~pink,ocean)]:
    mask=mask.astype(float)
    denom=np.maximum(.001,gaussian_filter(mask,24,mode=('nearest','wrap')))
    for ch in range(3):
        broad=gaussian_filter(intrinsic[:,:,ch]*mask,24,mode=('nearest','wrap'))/denom
        matched[:,:,ch]+=intrinsic[:,:,ch]/np.maximum(1,broad)*base[ch]*mask
correction=np.clip((.70-z)/.24,0,1)*(~badge)
front=front*(1-correction[:,:,None])+matched*ref_light[:,:,None]*correction[:,:,None]
# Store reference-lit albedo, exactly the convention the shared renderer uses.
back*=ref_light[:,:,None]
color=back*(1-fw[:,:,None])+front*fw[:,:,None]
# Contact + padded geometry across the entire sphere, including all rear land.
height=(.026*fw+.040*(1-fw))*bh-.005*seam*(1-fw)
pad=.027*np.clip(1-(rad/.368)**6,0,1);rim=.025*np.exp(-((rad-.340)/.018)**2)
height+=(pad+rim)*badge


height+=.003*np.sin(lon*5+.3)*np.cos(lat)**2+.002*np.sin(lat*7)
# Enforce a single colour/material sample at each pole, no fan/UV join artefact.
for arr in [color,land,height]:
    for row in [0,-1]: arr[row]=arr[row].mean(axis=0)
surface=np.stack([land,badge.astype(float),np.clip((height+.012)/.09,0,1)],-1)
OUT.mkdir(parents=True,exist_ok=True)
Image.fromarray(np.uint8(np.clip(color,0,255))).resize((1024,512),Image.Resampling.LANCZOS).save(OUT/'albedo.webp',quality=91,method=6)
Image.fromarray(np.uint8(surface*255)).resize((1024,512),Image.Resampling.BILINEAR).save(OUT/'surface.webp',lossless=True,method=6)
print('Continuous spherical felt maps:',1024,512,'source patches:',len(centres),'ocean:',ocean,'applique:',applique)
