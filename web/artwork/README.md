# One continuous plush globe

The supplied `eth-ball.webp`, `nft-ball.webp` and ice-blue brand board remain
unchanged in `public/brand/`. `plush-source.webp` is PR #7's 1254×1254 edited
blank-badge front. Its photographic fibres, applique and cream badge remain the
source for this iteration; no new logo or replacement globe photograph is used.
Original public brand folder: https://drive.google.com/drive/folders/1AbFGlSeh_epw4TgeGRen4C4aHgP65v0N

## Rebuild the maps

With Python 3, Pillow, NumPy and SciPy available:

```sh
python3 web/scripts/plush-materials.py
```

The optional deterministic recipe writes `web/public/brand/plush/albedo.webp`
and `surface.webp`. Both are 1024×512; the recipe works at 2048×1024 and filters
the delivered maps. `npm run build` copies these committed runtime assets and
needs neither Python nor image generation. The source photograph stays outside
`public/` because it is not a browser runtime dependency.

The previous mirrored swatch recipe is replaced completely. A seeded library of
many clean source-photo patches, rotated and smoothly overlapped in a large
atlas, supplies non-periodic felt detail. Three sphere-space projections keep
fibre scale continuous across the UV join and the poles. No mirrored tile or
repeating diamond is used. Signed-distance masks join the photographed geography
to reconstructed rear geography without transparent overlapping continents.
Every continent has a rounded displaced edge and contact shade. Longitudinal
panels, latitude joins and small pole caps have grooves and intermittent thread.

The central front retains its photographed albedo and single padded cream
badge. Its unobserved silhouette/side transition is reconstructed, removing the
photo's baked rim-light band. Directional light correction uses the same model
for the whole object. Blue/pink, pink/cream and Atlas palettes share those maps,
relief and fibres. Back geography is a reconstruction; no rear photograph or
photogrammetric scan was supplied.

`plushModel.ts` builds one 24,576-triangle mesh. WebGL uses mip filtering; the
Canvas fallback prefilters the same albedo, culls back-facing triangles and
rasterizes the same mesh. Wrapped normals close the longitudinal join. Dynamic
black glyphs are mapped only to the front badge. `paintGlobe` and its front
caches retain their API; `renderPlush` has an optional tilt for pole inspection.
The reveal's entry, 1.5-second eased turn, stop, 0.85-second hold and landing are
unchanged. No image swap or hidden rear is used.

Current submitted evidence is in `web/evidence/continuity/`: front/reference/side/back at the actual
43/59px picker and 140/170px stage sizes, 45-degree full turns, pole views for
both palettes, WebGL and software comparisons, and continuous normal-speed clips.
See `web/evidence/continuity/validation.md` for checks, measurements and limitations.
