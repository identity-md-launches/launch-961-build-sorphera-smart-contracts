# Plush material source

`plush-source.webp` is the blank-badge front used to reconstruct the shared
plush mesh. It is a 1254×1254 image edit made from the supplied `eth-ball.webp`
and the higher-resolution Sorphera brand board, using the image-generation
tool to remove the printed digits while retaining cream fabric and its padded
stitched rim. No flat patch was placed over the numerals.

The original brand package was retrieved from the public folder supplied in
the task: https://drive.google.com/drive/folders/1AbFGlSeh_epw4TgeGRen4C4aHgP65v0N
(Sorphera_Website_Package.zip, including the 1536×1024 brand board). The existing
reference WebPs in `public/brand/` remain intact. Downloaded originals and
intermediate images are not runtime assets and are not duplicated in the export.

`scripts/plush-materials.py` inverse-projects the edited front into an albedo
map. Unseen panels use felt swatches from that source and the existing geographic
outline, with applique thickness, softened edges, contact shading and panel
grooves. The second map encodes land, badge and displacement. The runtime builds
the displaced mesh and its surface normals; it rotates one continuous model.
Rear geography is a reconstruction, not a claim that rear photographs were supplied.

Optional regeneration, with Python 3, Pillow, NumPy and SciPy installed:

```sh
python web/scripts/plush-materials.py
```

Ordinary `npm run build` needs none of those Python tools or the network: the
2048×1024 albedo and lossless displacement/material WebPs are already committed
under `public/brand/plush/`. Source artwork is kept outside `public/` to avoid
shipping an unused source image to visitors. All five palettes share this model;
country codes and lottery numerals are transparent ink paths on the curved badge.

The front, 45°, side, 135° and rear were inspected alongside both original
references at 56px and 185px. The comparison in `evidence/revision/` records the
result. Fine fibre placement and unseen geography are reconstructed; this is
not a photogrammetric scan or a pixel-identical reproduction of the source.
