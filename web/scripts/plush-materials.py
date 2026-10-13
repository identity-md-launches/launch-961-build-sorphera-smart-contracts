"""Build a photo-derived, displaced plush material (no web build dependency).

Run with Python + Pillow, numpy and scipy. The committed WebP maps are runtime
assets; regenerating them is optional. Front fibres, applique edges and the
padded blank badge come from artwork/plush-source.webp, edited from the supplied photography.
Unseen panels continue the same sampled felt, with raised geographic applique.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates, distance_transform_edt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/brand/plush'
photo = np.array(Image.open(ROOT / 'artwork/plush-source.webp').convert('RGB')).astype(float)
W, H = 2048, 1024
u, v = np.meshgrid((np.arange(W)+.5)/W, (np.arange(H)+.5)/H)
lon, lat = (u-.5)*2*np.pi, (.5-v)*np.pi
x, y, z = np.sin(lon)*np.cos(lat), np.sin(lat), np.cos(lon)*np.cos(lat)
# Orthographic reconstruction of the photographed, lightly stuffed silhouette.
radial=np.sqrt(x*x+(y-.005)**2)
transition=np.clip((radial-.34)/.18,0,1)
badge_scale=1+.09*(1-transition*transition*(3-2*transition))
px, py = 625 + 564*x/badge_scale, 615 - 573*y/badge_scale
front = np.stack([map_coordinates(photo[:,:,c], [py,px], order=1, mode='nearest') for c in range(3)],-1)
pink = (front[:,:,0] > front[:,:,2]*1.05).astype(float)
badge = np.sqrt(x*x+(y-.005)**2) < .365
pink[badge] = 0

# Geographic continuation around the unseen hemisphere. Longitude -25 is front.
geo = Image.new('L',(W,H)); draw=ImageDraw.Draw(geo)
for ring in json.loads((ROOT/'src/earth-land.json').read_text()):
    for shift in [-360,0,360]:
        draw.polygon([((a+25+shift+180)/360*W,(90-b)/180*H) for a,b in ring],fill=255)
land = np.array(geo)/255.
front_weight = np.clip((z-.28)/.3,0,1)
land = gaussian_filter(land*(1-front_weight)+pink*front_weight,1)

# Material swatches sampled from clean felt on the source, not random noise.
def swatch(box):
    patch=photo[box[1]:box[3],box[0]:box[2]]
    ph,pw=patch.shape[:2]
    # Mirror tiling avoids a visible patch boundary and keeps fibre direction.
    tile=np.concatenate([patch,patch[:,::-1]],1)
    tile=np.concatenate([tile,tile[::-1]],0)
    xx=(u*W*1.1)%(2*pw); yy=(v*H*1.1)%(2*ph)
    return np.stack([map_coordinates(tile[:,:,c],[yy,xx],order=1,mode='wrap') for c in range(3)],-1)
felt=swatch((490,240,565,360))
applique=swatch((889,388,970,479))
# Flatten only broad illumination in the unseen continuation. The source front
# stays photographic; at angle zero its light correction is exactly identity.
felt*=np.array([117,165,197])/felt.mean(axis=(0,1))
applique*=np.array([229,139,177])/applique.mean(axis=(0,1))
# Felt applique has a rounded thickness and casts a soft contact shadow onto
# the cloth below it. These details continue into the unphotographed panels.
outside=distance_transform_edt(land<.5)
shadow=np.exp(-(outside/4.)**2)*(land<.5)
gy,gx=np.gradient(gaussian_filter(land,2.5))
bevel=np.clip(-gx*.8-gy, -.18, .18)
back = felt*(1-land[:,:,None])+applique*land[:,:,None]
back*=1-shadow[:,:,None]*.28+bevel[:,:,None]

# Pressed panel seams, with actual grooves in the displacement and stitches in
# the material. The UV seam closes; poles and the rear are complete surfaces.
meridian=np.abs(np.sin(lon*4))*np.cos(lat)
parallel=np.abs(np.sin(lat*4))
seam=np.exp(-(np.minimum(meridian,parallel)/.012)**2)*(1-land)
stitch=(np.cos(lat*240)>0.1)*np.exp(-((meridian-.017)/.006)**2)*(1-land)
back*=1-seam[:,:,None]*.22
back+=stitch[:,:,None]*17
ref_light=.52+.48*np.maximum(0,-.25*x+.52*y+.81*z)
# Store reference-lit albedo. Runtime compensates its baked broad light as the
# model rotates, so the front retains the photo and the back shares its light.
back*=ref_light[:,:,None]
color=back*(1-front_weight[:,:,None])+front*front_weight[:,:,None]
badge_mask=(badge & (z>.85)).astype(float)
rad=np.sqrt(x*x+(y-.005)**2)
pad=.027*np.clip(1-(rad/.368)**6,0,1)
rim=.025*np.exp(-((rad-.340)/.018)**2)
height=.021*gaussian_filter(land,1.5) - .006*seam*(1-front_weight)
height+=(pad+rim)*badge_mask
# Broad cloth relief from the real photograph, not synthetic speckle.
gray=color.mean(2)
relief=(gray-gaussian_filter(gray,3))/255
height+=np.clip(relief,-.2,.2)*.012
height += .003*np.sin(lon*5+.3)*np.cos(lat)**2 + .002*np.sin(lat*7)
surface=np.stack([land,badge_mask,np.clip((height+.012)/.09,0,1)],-1)
Image.fromarray(np.uint8(np.clip(color,0,255))).save(OUT/'albedo.webp',quality=88,method=6)
Image.fromarray(np.uint8(surface*255)).save(OUT/'surface.webp',lossless=True,method=6)
print('Saved photo-derived albedo and displacement/material map:', W, H)
