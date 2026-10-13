# Sorphera implemented design

## Overview

Sorphera is a playful lottery demo built around the requester's plush globe artwork: "Weekly ETH & NFT lottery ball jackpots. Powered by FWA." Charcoal space frames tactile ice-blue and pink spheres, the supplied ice-blue wordmark, cream badges with bold black numerals and restrained lavender accents. This iteration adds one plush globe asset family rendered from one displaced cloth mesh with photo-derived material maps, a 12-stamp Passport ("Buy 12, get 1 free", demo/simulated), and a three-globe Sorphera Atlas teaser above the footer. The site is a labelled demo: no real tickets, prizes, wallets or transactions.

Source of truth: `web/src/styles.css`, `web/src/PlushGlobe.tsx`, `web/src/components.tsx`, `web/src/Passport.tsx`, the page components and `web/public/brand/`. `dist/` is the corresponding static export. This document describes implemented values taken from that source after the final change, not a new specification.

## Colors

Semantic custom properties are declared in `styles.css` on `:root`. The app has one dark theme (`color-scheme: dark`).

| Token | Value | Implemented role |
| --- | --- | --- |
| `--ink` | `#19171c` | Page background, text on filled buttons, empty stamps |
| `--surface` | `#222027` | Picker and dialog surfaces |
| `--surface-raised` | `#2c2830` | Budget answer, round facts, Passport card, Buy-12 card, receipt passport panel |
| `--cream` | `#f7ecdf` | Primary readable text |
| `--muted` | `#b7aeb9` | Secondary copy, labels, Atlas captions |
| `--ice` | `#abd8ed` | Page headlines, ETH identity, finalized stamp rings, progress counts |
| `--pink` | `#f5a0c5` | Primary actions, NFT and bonus identity, reward lines, "free ticket available" |
| `--lavender` | `#baa6d4` | Pending stamp rings, chamber accents |
| `--line` | `#49414d` | Separators, card borders, empty stamp dashes |
| `--focus` | `#c8edff` | 3px keyboard outline with 5px offset, always outside the globe art |
| `--error` | `#ffc59e` | Recoverable validation errors |

Translucent tints derived from tokens: reward panel `#f5a0c51a` on `#f5a0c544` border; reward-mode banner `#abd8ed14` on `#abd8ed55`; Atlas surface `#1f1b22`.

Globe materials live in `plushModel.ts` and `public/brand/plush/`. The ETH material preserves the source photograph’s ice blue and pink. Other kinds recolor its luminance while retaining the blank cream badge, fibres and shadows: NFT base RGB (224,130,158), cream land (243,221,204); Canada red (195,54,66), cream land (244,231,212); Japan blossom (237,173,190), red land (191,43,55); Brazil green (51,142,76), yellow land (246,209,55). These are reference luminance targets, not flat rendered colors. The mesh has raised applique, a padded badge rim, pressed seams, surface normals derived from displacement, and rotating silhouette fibres. The model’s albedo and displacement/material maps are committed, local 2048×1024 WebPs.

The probe measured every solid text/background pair at 4.5:1 or better (3:1 large); text over canvas, images and gradients was not measured.

## Typography

Stack: `Inter, Arial, Helvetica, sans-serif`, no bundled font; the system fallback renders where Inter is absent. The wordmark is the supplied raster, never recreated in type.

Six type roles are defined on `:root`: `--type-caption` **12px**, `--type-small` **14px**, `--type-body` **18px**, `--type-title` **20px**, `--type-section` **28px**, and `--type-display` **clamp(36px, 5vw, 64px)**. Root and form controls are 18px with 1.55 body line height; small text explicitly uses 12px rather than the browser’s 0.833em reduction. Weights are **400, 600, 700**. Headings use balanced wrapping, 1.12 line height and tracking no tighter than -0.5px below 28px (display headings keep -2px). The tagline is 20px; jackpot amounts share the display role. Labels (`.eyebrow`) use normal case and natural tracking. Money, countdowns and totals use tabular numbers. Globe ink uses bundled rounded vector paths for 0–9, + and the country codes, so a missing font cannot substitute Arial Black. Ink is sampled on the curved badge and is independent of its fabric texture.

## Spacing and layout

`.main` is capped at 1280px with 36px desktop inline padding; the header spans up to 1360px. Sections separate by 38 to 82px, related controls by 8 to 24px, surfaces pad 16 to 28px. Radii: 24px (`--radius`) for major surfaces, 18 to 20px for cards (Passport, Buy-12, Atlas, closing banner), 14px for inline panels, 10px for fields, 50% for globes, stamps and slots.

Responsive behaviour (breakpoints in `styles.css`): below 720px the Atlas section tightens padding, its globes drop from 124px to 92px, and the Passport ledger table scrolls horizontally inside its own box; the existing breakpoints near 1100px, 900px, 720px and 420px stack the play layout (picker above basket), the jackpot grid, the steps and the footer. Picker globes shrink by breakpoint (59px to about 45px) while the badge keeps the same proportion because the art is one cached 256px render per number. No horizontal scroll at 320, 390 or 1440 (probe-measured). At 390×844 the first screen shows the wordmark, exact tagline, "Make your picks", the hero photography and the first jackpot amount. Below 420px, the hero wordmark is capped at 280px, its top padding is 24px and the photo container and image are 140px tall. The duplicated kicker and wallet direction were removed from Home; round information is integrated into each jackpot label.

## Components

- **Plush globe** (`PlushGlobe.tsx`, `plushModel.ts`, `Globe` in `components.tsx`): unchanged `paintGlobe(canvas, kind, angle, number)` API with cached 256px resting renders per kind and number. A 24,576-triangle displaced cloth mesh uses the photo-derived blank material, raised continents, padded stitched badge, surface normals and curved silhouette fibres. One hidden WebGL canvas serves the family; a software triangle renderer uses the same mesh/material when WebGL is unavailable. Asynchronous loading discards superseded paint requests. Kinds remain `eth`, `nft`, `ca`, `jp`, `br`. Normal/picker, basket, receipt, ticket, Passport, draw, slot and Atlas renderings use this family. Selection/match/focus rings remain outside the art. Optional material regeneration is in `web/scripts/plush-materials.py`; its source blank photograph is in `web/artwork/`.
- **Reveal stage** (`Chamber.tsx`, `DrawRoom.tsx`): enters badge-away, turns globe and badge together with a cubic ease-out over 1.5s, stops facing the viewer, holds 0.85s, then travels into its slot at the same orientation. Bonus uses the pink kind. Reduced motion uses static quick reveals. Numbers and announcements are gated by the stop.
- **Passport card** (`Passport.tsx`): heading, "Demo · simulated" pill, rule line, 12 `Stamps` (finalized = ice ring with globe, pending = lavender ring with faded globe, empty = dashed), progress "8 of 12 tickets" / "4 more to your next free ticket", pending note, reward panel with "Use free ticket". Compact variant on Play and Home (one row of 12). The card-completion state (`.stamps-complete`) pops each stamp over 420ms and is disabled under `prefers-reduced-motion`.
- **Reward mode banner** and **reward line** (Play): the banner explains the free-ticket pick; reward lines carry a 3px pink left rule and "Reward · US$0.00".
- **Basket passport** and **receipt passport**: 12-stamp strip with projected progress, and the completed card with the paid/reward quantities on the receipt.
- **Passport ledger** (My tickets): table of purchases with pending, finalized, refunded and failed states, stamps earned and two demo controls.
- **Buy-12 card** (Home): two small globes ("12" and "+1"), heading, one sentence and a link to the passport.
- **Atlas teaser** (Home, above the footer): heading "Sorphera Atlas", pink line "A few worlds up our sleeve.", one sentence, "Concept artwork." label and three large country globes with code badges CA, JP, BR. No call to action.
- **Buttons, pills, modal, fields, filters, jackpot cards, steps, history rows, finale**: unchanged from the previous iteration except for the type roles and Home round-label/hero corrections above.

## Writing

Copy stays short and literal: "Buy 12, get 1 free", "Every 12 paid tickets earns 1 free ticket.", "1 free ticket available", "Reward ticket". Demo boundaries are stated next to the feature ("Demo · simulated", "Demo data stored in this browser"). Players are never prompted to exceed the budget or hurry to complete a card. The reward rule shown to players is: "Reward tickets enter the same draw and are included in the total number of entries."

## Do's and don'ts

- Do render every ball with `Globe` or `PlushGlobe`; never place a flat disc or photographed crop over a badge.
- Do keep focus and selection rings outside the canvas.
- Do keep paid and reward lines visually separate and the network fee visible on free-only checkouts.
- Don't add tracked capitals, kicker labels, new type sizes or weights.
- Don't attach mint, price, date or utility language to the Atlas teaser.
