# Sorphera implemented design

## Overview

Sorphera is a playful lottery experience built around the requester-supplied plush globe artwork. The default site is a labelled demo for people exploring two independent weekly ETH/NFT games. Charcoal space frames tactile blue and pink spheres, the original ice-blue wordmark, cream numbers and restrained lavender accents. The hero is spacious; transactional pages keep the picker, ticket total and next action together. Results use rows, explanations use open columns, and gallery items use media surfaces rather than a repeated dashboard-card layout.

Source of truth: `web/src/styles.css`, `web/src/components.tsx`, the page components and `web/public/brand/`. `dist/` is the corresponding static export. Screenshots and actual review evidence are in `artifacts/`, with Git-eligible copies in `web/evidence/`. The final implementation was reviewed with the pinned Better Interface guide; this document describes implemented behavior, not a new specification.

## Colors

The source uses hexadecimal semantic custom properties in `styles.css:1`.

| Token | Value | Implemented role |
| --- | --- | --- |
| `--ink` | `#19171c` | Page background, dark text on filled buttons |
| `--surface` | `#222027` | Picker and dialog surfaces |
| `--cream` | `#f7ecdf` | Primary readable text |
| `--muted` | `#b7aeb9` | Secondary copy, explanatory labels |
| `--ice` | `#abd8ed` | Page headlines, ETH identity, selected ETH game |
| `--pink` | `#f5a0c5` | Primary actions, NFT identity and bonus accents |
| `--lavender` | `#baa6d4` | Restrained eyebrows, disclosure markers, chamber accents |
| `--line` | `#49414d` | Separators and surface structure |
| `--focus` | `#c8edff` | 3px keyboard outline with 5px offset |
| `--error` | `#ffc59e` | Recoverable validation errors |

`--surface-raised: #2c2830` and `--space: 8px` are declared but not component-facing primitives; avoid assuming they define an additional active surface or enforced spacing system. The app has one dark theme (`color-scheme: dark`), not a light theme. Game identity uses text as well as color. The selected number has a ring and an `aria-pressed` state, and every outcome has a textual status.

Actual browser-computed contrast pairs measured: cream on ink 15.26:1; muted on picker surface 7.49:1; ink on pink primary 9.08:1; ink on ice selected game 11.67:1; focus on picker surface 13.05:1. These measurements do not establish contrast over every translucent/illustrated background; those limits are recorded in validation.

## Typography

The UI stack is `Inter, Arial, Helvetica, sans-serif`. No font is downloaded or bundled: Inter is used only if installed locally, otherwise the system fallback renders. The Sorphera wordmark is the supplied transparent raster, never recreated in CSS or type.

The root is 16px with 1.55 line height and font synthesis disabled. Body descriptions use 14–16px and 1.55–1.8 line height. Large page headings use responsive `clamp()` sizes, generally 36–55px in `PageHead`; top-level global headings can reach 64px. Heading line height is 1.12 with slightly negative letter spacing. Section headings are 25–35px; card headings 18–24px. Eyebrows use 9–11px uppercase text and 1.4–2px tracking, with supporting content always available at readable body size. Fine print is normally 12px, with footer attribution as small as 10px.

Headings use balanced wrapping; paragraphs use pretty wrapping. Long explanations are capped near 70ch. Monetary values and countdowns use tabular numbers. Inputs/selects stay 16px to avoid mobile input zoom. Source values, not a separate design-tool scale, control typography. The browser rendered the system font stack; no bundled custom font load is claimed.

## Layout

The `.main` container has a 1280px maximum width, 36px desktop inline padding and a shared leading edge. The header spans up to 1360px. Major sections use roughly 38–82px separation; related controls use 8–24px gaps. Main surfaces use 18–28px padding. Open explanatory steps deliberately use more space than ticket lines.

The desktop hero uses equal columns. Jackpot panels form two columns, steps three and the gallery four. Play uses a larger picker column and a minimum 300px ticket column. Tickets use flexible rows; history uses a two-column content/result row. FAQ uses a one-third introduction and two-thirds disclosures.

Source breakpoints:

- At 1050px: tighten header gaps, panels and globe controls; ticket claim actions may wrap.
- At 800px: navigation becomes its own header row, two-column sections tighten, gallery art scales down.
- At 620px: centered stacked hero, single-column jackpots and play, single-column steps/history/FAQ, two-column gallery, stacked footer details. Main padding becomes 20px. The FAQ's decorative introduction is omitted; all questions remain present.
- At 360px: main/header padding becomes 16px, the hero bleed is exactly 16px per side, and globe controls reduce to fit five columns without overflow.

All six routes were checked for horizontal overflow at 320, 768 and 1440 CSS pixels; none remained. Additional mobile interaction/screenshots used 390px. Native 200% zoom, RTL mirroring and physical devices were not verified. The demo notice stays sticky at the viewport top. Hash-route focus moves to `main` with `preventScroll`, maintaining the visible page header. No permanent bottom action bar obscures content.

## Elevation & Depth

Panels use tonal contrast, thin structural borders and 24px radii. The two jackpot gradients tint a charcoal surface with restrained blue/pink. Gallery spheres cast soft shadows. The supplied hero scene provides most of the tactile depth and iridescent crystal imagery; the UI does not introduce neon effects.

The chamber is a lightweight CSS assembly of local sphere images, translucent circular outlines and a restrained radial background. It is lazy-loaded, with a single-globe loading fallback. Modal dialogs use the native top layer, a dark translucent blurred backdrop, a 24px radius and `0 24px 100px #0008` shadow. The demo bar's z-index is 20; native dialogs appear above it and include their own demo notice.

## Shapes

`--radius: 24px` is the major panel radius. Buttons use 12px, fields/selects 10px, gallery media 18px and the closing banner 20px. Pills and all globe badges are circular/rounded. The number picker uses a 2px selection border; keyboard focus is an additional 3px outline. Structural borders are normally 1px. Ticket dividers use dashed rules to evoke a ticket without compromising the reading order.

Sphere crops retain their source proportions through `object-fit: cover` and circular clipping. Their cream number overlays are positioned as part of the shared `Globe` component, and their visual content is not the source of accessible numeric results.

## Components

- **`Globe` / `Balls` (`web/src/components.tsx`)**: ETH blue/pink and NFT pink/cream globe variants, sizes `small`, `normal`, `large`. `Balls` exposes a complete text alternative with all main numbers and the distinct bonus. Decorative nested images have empty alt text. Reused in picking, tickets, gallery, history and reveals.
- **`PageHead` / `SectionHeading`**: consistent eyebrow, heading, explanatory copy and optional trailing action. Use them for a new route or section rather than adding unrelated title sizes.
- **Buttons and links**: `.button.primary` uses pink fill; `.ice` and `.pink-button` distinguish jackpot actions. `.quiet`, `.text-button`, `.inline-link` and `.icon-button` are lower-emphasis patterns. Native buttons handle Enter/Space; real anchors handle navigation. Focus is visible. Press scale is exactly 0.96 under motion preference; hover changes brightness without continuous motion.
- **Picker (`Play.tsx`)**: native buttons with `aria-pressed`, three main selections and one bonus, a visible selection count, Quick Pick, editable lines and labelled quantity. A fourth main choice is disabled until a selected number is removed. Invalid quantity gets an announced error and focus. Ticket review includes exact game/round/price/quantity and simulated confirmation states.
- **`Modal`**: native `<dialog>` via `showModal()`, accessible heading, Escape handling, top-layer focus containment and return to the trigger on close. Content scrolls inside the viewport. Pending actions cannot be dismissed until the short operation resolves. Persistent errors are not timed toasts.
- **Draw room (`DrawRoom.tsx`, `Chamber.tsx`)**: user-started replay only, 1.1-second event/reveal steps, distinct bonus ball, pause/resume and skip. Reduced motion disables chamber animation and uses a brief 60ms step interval. Mute defaults on; optional audio is initiated only by a user play action. `core.ts` supplies the deterministic event reducer; animation does not determine numbers or winners.
- **My tickets (`Tickets.tsx`)**: game/round filters, clear-filter empty state, textual statuses and native claim dialogs. The parent `ClaimMemory` persists partial claims and reward delivery across route changes in the same page session. Reload starts a fresh demo.
- **Disclosures**: native `<details>/<summary>` for FAQ, provenance, accounting, result and custody details. Detailed technical proofs are expandable, not primary navigation clutter.
- **Live workspace (`LiveWorkspace.tsx`)**: separately lazy-loaded and unavailable without verified configuration. Its controls reuse the same field, dialog, row and button patterns. It is typed and includes ABI-based claims but was not visually or financially exercised against a genuine deployment.

## Do's and Don'ts

Start a new page inside `.main` with `PageHead`, then reuse the existing content grid, `Globe` and action styles. Keep important copy in normal flow; use section spacing before adding another bordered surface. Keep the original wordmark and ice-blue icon, local assets, cream-readable text, distinct pink bonus and textual game labels.

Keep the exact tagline and persistent demo boundary. Label synthetic data at its point of use. Never show a provisional NFT match as a winning ticket, queueing as delivery, a pending pull as a secured NFT, or a timer as a source of randomness. Preserve explicit reduced-motion, sound and replay controls.

Do not show the brand board's “BRAND CONCEPT 01” label or superseded pink logo. Do not create guessed deployments, external NFT valuations, animated jackpots, endorsements or a competing dashboard aesthetic. A new interactive control needs a native semantic element, visible focus, a clear label and a recovery path for failure.

Design guidance attribution and licenses: `web/THIRD_PARTY_NOTICES.md` and `web/licenses/better-interface.txt`.
