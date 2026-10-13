# Sorphera implemented design

## Overview

Sorphera is a playful lottery demo built around the requester's plush globe artwork: "Weekly ETH & NFT lottery ball jackpots. Powered by FWA." Charcoal space frames tactile ice-blue and pink spheres, the supplied ice-blue wordmark, cream badges with bold black numerals and restrained lavender accents. This iteration adds one plush globe asset family rendered from a single textured sphere model, a 12-stamp Passport ("Buy 12, get 1 free", demo/simulated), and a three-globe Sorphera Atlas teaser above the footer. The site is a labelled demo: no real tickets, prizes, wallets or transactions.

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

Globe materials are not CSS tokens; they are sampled from the reference photographs and live in `PlushGlobe.tsx`: ETH felt `#86b0d6` to `#5a84ac` with pink continents `#f08fbd` (lit `#ffa9d4`, shade `#b25c78`); NFT/bonus felt `#f08aa8` to `#c9647f` with cream continents `#f6dfd0`; badge cream `#fbf3e7` to `#d9c5ae` with stitched rim `#b99e86`/`#8f7762`; numerals `#1f1a1d`. Atlas concept globes: Canada red `#d8404b` with cream land, Japan blossom `#f3b9c9` with red land `#d9343f`, Brazil green `#2f9a5c` with yellow land `#f5d33f`.

The probe measured every solid text/background pair at 4.5:1 or better (3:1 large); text over canvas, images and gradients was not measured.

## Typography

Stack: `Inter, Arial, Helvetica, sans-serif`, no bundled font; the system fallback renders where Inter is absent. The wordmark is the supplied raster, never recreated in type.

One scale of pixel sizes after this iteration's consolidation: **12, 14, 16, 18, 20, 24, 28**, plus display headings via `clamp()` (`h1` 36 to 64px, `h2` 25 to 35px, hero and jackpot amounts up to 50px). Root is 16px with 1.55 line height. Weights are **400, 600, 700**. Headings use balanced wrapping, 1.12 line height and tracking no tighter than -0.5px below 28px (the `h1` keeps -2px display tracking). Labels formerly set in tracked small capitals (`.eyebrow`) now render as 14px normal-case muted text with natural letter spacing; no `text-transform: uppercase` remains in the stylesheet. Inputs and selects stay 16px to avoid mobile zoom. Money, countdowns and totals use tabular numbers. Globe numerals are drawn on the canvas badge in a 900-weight rounded stack (`Arial Rounded MT Bold`, `Nunito`, `Arial Black`, Arial) with rounded strokes.

## Spacing and layout

`.main` is capped at 1280px with 36px desktop inline padding; the header spans up to 1360px. Sections separate by 38 to 82px, related controls by 8 to 24px, surfaces pad 16 to 28px. Radii: 24px (`--radius`) for major surfaces, 18 to 20px for cards (Passport, Buy-12, Atlas, closing banner), 14px for inline panels, 10px for fields, 50% for globes, stamps and slots.

Responsive behaviour (breakpoints in `styles.css`): below 720px the Atlas section tightens padding, its globes drop from 124px to 92px, and the Passport ledger table scrolls horizontally inside its own box; the existing breakpoints near 1100px, 900px, 720px and 420px stack the play layout (picker above basket), the jackpot grid, the steps and the footer. Picker globes shrink by breakpoint (59px to about 45px) while the badge keeps the same proportion because the art is one cached 256px render per number. No horizontal scroll at 320, 390 or 1440 (probe-measured). The first screen at 390 shows the wordmark, tagline, "Make your picks" and the hero artwork.

## Components

- **Plush globe** (`PlushGlobe.tsx`, `Globe` in `components.tsx`): one 256px canvas per kind and number, rendered by per-pixel ray/sphere mapping of a 1024x512 felt texture: quilted seams, raised continents with rounded edges and contact shadows, padded stitched badge, dynamic numerals. Kinds `eth`, `nft`, `ca`, `jp`, `br`. Sizes `small` 45px, normal 59px, `large` 112px (124px in Atlas, 170px on the reveal stage). Angle 0 renders are cached; selection and match rings are `box-shadow` outside the art.
- **Reveal stage** (`Chamber.tsx`, `DrawRoom.tsx`): enters badge-away, turns globe and badge together with a cubic ease-out over 1.5s, stops facing the viewer, holds 0.85s, then travels into its slot at the same orientation. Bonus uses the pink kind. Reduced motion uses static quick reveals. Numbers and announcements are gated by the stop.
- **Passport card** (`Passport.tsx`): heading, "Demo · simulated" pill, rule line, 12 `Stamps` (finalized = ice ring with globe, pending = lavender ring with faded globe, empty = dashed), progress "8 of 12 tickets" / "4 more to your next free ticket", pending note, reward panel with "Use free ticket". Compact variant on Play and Home (one row of 12). The card-completion state (`.stamps-complete`) pops each stamp over 420ms and is disabled under `prefers-reduced-motion`.
- **Reward mode banner** and **reward line** (Play): the banner explains the free-ticket pick; reward lines carry a 3px pink left rule and "Reward · US$0.00".
- **Basket passport** and **receipt passport**: 12-stamp strip with projected progress, and the completed card with the paid/reward quantities on the receipt.
- **Passport ledger** (My tickets): table of purchases with pending, finalized, refunded and failed states, stamps earned and two demo controls.
- **Buy-12 card** (Home): two small globes ("12" and "+1"), heading, one sentence and a link to the passport.
- **Atlas teaser** (Home, above the footer): heading "Sorphera Atlas", pink line "A few worlds up our sleeve.", one sentence, "Concept artwork." label and three large country globes with code badges CA, JP, BR. No call to action.
- **Buttons, pills, modal, fields, filters, jackpot cards, steps, history rows, finale**: unchanged from the previous iteration except for the label token and type scale above.

## Writing

Copy stays short and literal: "Buy 12, get 1 free", "Every 12 paid tickets earns 1 free ticket.", "1 free ticket available", "Reward ticket". Demo boundaries are stated next to the feature ("Demo · simulated", "Demo data stored in this browser"). Players are never prompted to exceed the budget or hurry to complete a card. The reward rule shown to players is: "Reward tickets enter the same draw and are included in the total number of entries."

## Do's and don'ts

- Do render every ball with `Globe` or `PlushGlobe`; never place a flat disc or photographed crop over a badge.
- Do keep focus and selection rings outside the canvas.
- Do keep paid and reward lines visually separate and the network fee visible on free-only checkouts.
- Don't add tracked capitals, kicker labels, new type sizes or weights.
- Don't attach mint, price, date or utility language to the Atlas teaser.
