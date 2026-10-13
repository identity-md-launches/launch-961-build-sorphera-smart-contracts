# Sorphera implemented design

## Overview

Sorphera is a playful lottery demo built around the requester's plush globe artwork: "Weekly ETH & NFT lottery ball jackpots. Powered by FWA." Charcoal space frames tactile ice-blue and pink spheres, the supplied ice-blue wordmark, cream badges with bold black numerals and restrained lavender accents. The shared displaced cloth mesh now continues the photographic front through a coherent full turn. Factual sales and draw-window schedules appear across the purchase and return journey, with an upcoming-first Draw Room. The site retains a 12-stamp Passport ("Buy 12, get 1 free", demo/simulated), and a three-globe Sorphera Atlas teaser above the footer. The site is a labelled demo: no real tickets, prizes, wallets or transactions.

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

Globe materials live in `plushModel.ts` and `public/brand/plush/`. The ETH material preserves the source photograph’s ice blue and pink. Other kinds recolor its luminance while retaining the blank cream badge, fibres and shadows: NFT base RGB (224,130,158), cream land (243,221,204); Canada red (195,54,66), cream land (244,231,212); Japan blossom (237,173,190), red land (191,43,55); Brazil green (51,142,76), yellow land (246,209,55). These are reference luminance targets, not flat rendered colors. The mesh has raised applique, a padded badge rim, pressed seams, surface normals derived from displacement, and rotating silhouette fibres. The model’s albedo and displacement/material maps are committed, local 1024×512 WebPs, filtered from a 2048×1024 reconstruction. Sphere-space overlapping photo patches replace the old mirrored swatch; contact shade, sewn panels and relief extend around the back and poles. A single blank cream badge stays on the curved front.

The probe measured every solid text/background pair at 4.5:1 or better (3:1 large); text over canvas, images and gradients was not measured.

## Typography

Stack: `Inter, Arial, Helvetica, sans-serif`, no bundled font; the system fallback renders where Inter is absent. The wordmark is the supplied raster, never recreated in type.

Six type roles are defined on `:root`: `--type-caption` **12px**, `--type-small` **14px**, `--type-body` **18px**, `--type-title` **20px**, `--type-section` **28px**, and `--type-display` **clamp(36px, 5vw, 64px)**. Root and form controls are 18px with 1.55 body line height; small text explicitly uses 12px rather than the browser’s 0.833em reduction. Weights are **400, 600, 700**. Headings use balanced wrapping, 1.12 line height and tracking no tighter than -0.5px below 28px (display headings keep -2px). The tagline is 20px; jackpot amounts share the display role. Labels (`.eyebrow`) use normal case and natural tracking. Money, countdowns and totals use tabular numbers. Globe ink uses bundled rounded vector paths for 0–9, + and the country codes, so a missing font cannot substitute Arial Black. Ink is sampled on the curved badge and is independent of its fabric texture.

## Layout

`.main` is capped at 1280px with 36px desktop inline padding; the header spans up to 1360px. Sections separate by 38 to 82px, related controls by 8 to 24px, surfaces pad 16 to 28px. Radii: 24px (`--radius`) for major surfaces, 18 to 20px for cards (Passport, Buy-12, Atlas, closing banner), 14px for inline panels, 10px for fields, 50% for globes, stamps and slots.

Responsive behaviour (breakpoints in `styles.css`): below 720px the Atlas section tightens padding, its globes drop from 124px to 92px, and the Passport ledger table scrolls horizontally inside its own box; the existing breakpoints near 1100px, 900px, 720px and 420px stack the play layout (picker above basket), the jackpot grid, the steps and the footer. Picker globes shrink by breakpoint (59px to 43px) while the badge keeps the same proportion because the art is one cached 256px render per number. No horizontal scroll at 320, 390 or 1440 (probe-measured). The Home primary action has no decorative arrow, keeping both hero actions in one 46px row at 390px with Arial and DejaVu Sans fallback metrics. Below 620px, Play uses `minmax(0, 1fr)` with `min-width: 0` on the picker and basket, so both cards fit their 288px grid at a 320px viewport without hiding overflow. At 390×844 the first screen shows the wordmark, exact tagline, "Make your picks", the hero photography and the first jackpot amount. Below 420px, the hero wordmark is capped at 280px, its top padding is 24px and the photo container and image are 140px tall. The duplicated kicker and wallet direction were removed from Home; round information is integrated into each jackpot label.

Schedules use a two-column grid for sales and draw times, with 20px desktop / 12px mobile gaps, 14px labels, 20px values (18px below 600px), and 12px exact local dates and caveats. They stay compact in jackpots, checkout and My tickets. The upcoming Draw Room uses a 1.4fr/1fr grid and the display role for its draw countdown. Below 600px it stacks draw above sales, keeps the draw value at 36px, reduces padding from 32px to 20px and its decorative globe to 66px. The ETH/NFT switch remains full-width. Home, Play, Draw Room and My tickets were checked at 320, 390, 768 and 1440px without page overflow.

## Elevation & Depth

The background, `--surface` and `--surface-raised` provide tonal separation. New schedule blocks are flat inside their parent; they do not add nested shadow cards. The upcoming round has a `--surface` background. Existing modal depth uses `0 24px 100px #0008`; actual plush geometry, contact shadows and a few stage glows supply the product depth. Focus uses an outline outside controls, not an inset badge effect. The design probe found no stacked border-plus-shadow cards on Home.

## Shapes

`--radius: 24px` rounds major surfaces; cards generally use 18–20px, fields 10px, game-switch links 12px and spherical art 50%. Schedule cells have no extra border or clipping. Calendar links wrap naturally and retain a 44px minimum height. Reveal and picker selection rings remain outside the sphere.

## Components

- **Plush globe** (`PlushGlobe.tsx`, `plushModel.ts`, `Globe` in `components.tsx`): unchanged `paintGlobe(canvas, kind, angle, number)` API with cached 256px resting renders per kind and number. A 24,576-triangle displaced cloth mesh uses the photo-derived blank material, raised continents, padded stitched badge, surface normals and curved silhouette fibres. At the poles, WebGL reprojects the existing albedo once into two 256px planar x/z patches. Trilinear mip filtering is retained, with a smooth blend from radial `abs(y)=0.90` to `0.96`; this prevents the longitude UV singularity from blurring fibres into spokes. The maps, central photograph, geometry and public API stay shared. One hidden WebGL canvas serves the family; a software triangle renderer uses the same mesh/material when WebGL is unavailable. Asynchronous loading discards superseded paint requests. Kinds remain `eth`, `nft`, `ca`, `jp`, `br`. Normal/picker, basket, receipt, ticket, Passport, draw, slot and Atlas renderings use this family. Selection/match/focus rings remain outside the art. Optional material regeneration is in `web/scripts/plush-materials.py`; its source blank photograph is in `web/artwork/`.
- **Round schedule** (`RoundSchedule.tsx`, `schedule.ts`): accepts an authoritative `Round`, optional `priority` and `calendar`. Shows semantic status, both countdowns and exact dates in the user's time zone, plus the delay caveat. `priority` puts the draw first at display size. `useNow` is one shared one-second clock refreshed on focus, pageshow and visibility changes. Only state changes use a polite status region; seconds are not repeatedly announced. “Timing unavailable”, paused, closed, preparing, oracle, tie-break, rollover, cancellation and confirmed states have literal labels.
- **Calendar actions** (`RoundSchedule.tsx`): separate draw-window opening and sales-closing buttons with 44px hit areas. Missing earliestDraw disables the draw action. Downloads have distinct UTC timestamps, UIDs, titles and exact round links; both carry the delay caveat.
- **Upcoming draw** (`UpcomingDraw.tsx`): ETH/NFT link switch with `aria-current`, explicit round identity, large draw timer, ticket list and separate simulation/replay links. Missing or unknown schedules show an honest empty state. “Explore next simulated round” is an explicit transition after cutoff, never a clock side effect.
- **Checkout and saved drafts** (`Play.tsx`, `demoStorage.ts`): shared schedules in review and receipt; disabled review/confirmation at cutoff or pause, with handler rechecks. Closure retains budget, paid lines, unused reward lines and Passport progress. Saved older-round drafts have an explicit revisit/removal control. Receipts and My tickets link to their exact game/round.
- **Reveal stage** (`Chamber.tsx`, `DrawRoom.tsx`): enters badge-away, turns globe and badge together with a cubic ease-out over 1.5s, stops facing the viewer, holds 0.85s, then travels into its slot at the same orientation. Bonus uses the pink kind. Reduced motion uses static quick reveals. Numbers and announcements are gated by the stop.
- **Passport card** (`Passport.tsx`): heading, "Demo · simulated" pill, rule line, 12 `Stamps` (finalized = ice ring with globe, pending = lavender ring with faded globe, empty = dashed), progress "8 of 12 tickets" / "4 more to your next free ticket", pending note, reward panel with "Use free ticket". Compact variant on Play and Home (one row of 12). The card-completion state (`.stamps-complete`) pops each stamp over 420ms and is disabled under `prefers-reduced-motion`.
- **Reward mode banner** and **reward line** (Play): the banner explains the free-ticket pick; reward lines carry a 3px pink left rule and "Reward · US$0.00".
- **Basket passport** and **receipt passport**: 12-stamp strip with projected progress, and the completed card with the paid/reward quantities on the receipt.
- **Passport ledger** (My tickets): table of purchases with pending, finalized, refunded and failed states, stamps earned and two demo controls.
- **Buy-12 card** (Home): two small globes ("12" and "+1"), heading, one sentence and a link to the passport.
- **Atlas teaser** (Home, above the footer): heading "Sorphera Atlas", pink line "A few worlds up our sleeve.", one sentence, "Concept artwork." label and three large country globes with code badges CA, JP, BR. No call to action.
- **Buttons, pills, modal, fields, filters, jackpot cards, steps, history rows, finale**: use existing components and tokens. The skip link and native keyboard controls retain the visible `--focus` outline; the modal traps focus, closes with Escape and restores focus. New navigation uses native links. Timers never trigger a modal or an announcement of an invented winner.

### Writing

Copy stays short and literal: "Buy 12, get 1 free", "Every 12 paid tickets earns 1 free ticket.", "1 free ticket available", "Reward ticket". Demo boundaries are stated next to the feature ("Demo · simulated", "Demo data stored in this browser"). Players are never prompted to exceed the budget or hurry to complete a card. The reward rule shown to players is: "Reward tickets enter the same draw and are included in the total number of entries."

## Do's and don'ts

- Do render every ball with `Globe` or `PlushGlobe`; never place a flat disc or photographed crop over a badge.
- Do keep focus and selection rings outside the canvas.
- Do keep paid and reward lines visually separate and the network fee visible on free-only checkouts.
- Don't add tracked capitals, kicker labels, new type sizes or weights.
- Don't attach mint, price, date or utility language to the Atlas teaser.
- Do use `RoundSchedule` for round times, preserve UTC timestamps, and keep earliest request time distinct from confirmed results. Do not introduce flashing countdowns, urgency colors or a LIVE badge when a timer expires.
- Add a page with the shared `PageHead`, `.main` layout and six type roles. Use a pink `.button.primary` for its main action, existing neutral buttons for secondary choices, and shared game/round links instead of guessing a replay.
