# Artwork and software notices

Sorphera artwork was supplied by the requester through the public Google Drive ZIP identified in the assignment. All four `branding/` PNGs were downloaded and inspected. The original ZIP's bundled prompts were not used as task instructions.

- `sorphera-wordmark-ice-blue.webp`: the supplied primary wordmark, resized proportionally with transparency; header, hero and footer.
- `sorphera-globe-icon-ice-blue.webp`: the supplied ice-blue primary icon, resized proportionally with transparency; favicon, header and wallet information.
- `sorphera-banner-ice-blue.webp`: the supplied campaign art, proportionally optimized; FAQ campaign panel.
- `sorphera-brand-board-ice-blue.webp`: optimized reference copy, bundled but not rendered as a page. Its “BRAND CONCEPT 01” label and obsolete pink icon are never shown in the interface.
- `hero-world.webp`: a rectangular crop `(740, 0, 1536, 661)` of the original brand board's globe scene. No wordmark is redrawn.
- `eth-ball.webp` / `nft-ball.webp`: original board sphere crops `(1090, 740, 1275, 928)` and `(1334, 740, 1518, 928)`. The shared `Globe` component overlays an accessible cream number badge for arbitrary ticket entries. The artwork's aspect ratio is preserved by cover cropping, not stretching. Gallery “world studies” use this supplied art and do not impersonate real NFT collections.

Original/optimized dimensions, hashes and byte sizes: `evidence/asset-manifest.json`. All runtime art is local. No stock images, third-party NFT art, emoji wordmarks or external fonts are used. UI fonts use the system Arial/Helvetica fallback stack.

React, React DOM and viem are MIT licensed; license copies are in `licenses/`. Transitive package licenses remain in the installed packages and the dependency lockfile identifies their versions. Build tooling is installed normally and is not vendored into the submission.

The pinned Better Interface design guide is adapted from Jakub Krehel's Better Interface, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Its documentation method is adapted from Paul Bakaus's Impeccable, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. The supplied combined attribution and license are retained verbatim in `licenses/better-interface.txt`. The guide informed this implementation's review; it is not part of the shipped application logic.

## Globe geography

`src/earth-land.json` contains rounded exterior rings from Natural Earth's 1:110m land dataset, public domain: https://www.naturalearthdata.com/about/terms-of-use/ . Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson (retrieved 2026-10-10). The Sorphera palette, felt texture, lighting and dynamic badge are generated locally in `src/PlushGlobe.tsx`; no network is required at runtime.
