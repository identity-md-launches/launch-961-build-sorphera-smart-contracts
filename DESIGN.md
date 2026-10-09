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

`--surface-raised: #2c2830` backs the budget answer, round-fact cells and finale; `--space: 8px` is declared but not an enforced spacing system; avoid assuming they define an additional active surface or enforced spacing system. The app has one dark theme (`color-scheme: dark`), not a light theme. Game identity uses text as well as color. The selected number has a ring and an `aria-pressed` state, and every outcome has a textual status.

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
- **Budget bar (`Play.tsx`, `budget.ts`)**: `.budget-bar` is a two-column surface (one column ≤760px) holding the editable "Total spending limit (US$)" field and a `.budget-answer` status that states how many whole tickets fit after the estimated fee, or why none does. USD is presentation only: `usdCents` converts exact wei with integer arithmetic at the fixed illustrative rate (`demoQuote`: US$2,500/ETH, 0.0004 ETH fee per purchase). Every USD figure carries the "illustrative" label. Nothing is added or bought automatically.
- **Round facts (`RoundFacts`)**: three raised cells (`.round-facts`) above the picker showing prize (ETH + USD, or secured NFT count), ticket price in ETH + USD, and the closing countdown with local date/time and timezone via `localTime`. Values use tabular numerals in `--ice`, or `--pink` for the NFT game. `.sharing-note` beneath explains ETH sharing versus one NFT winner with a pink left rule.
- **Picker (`Play.tsx`)**: native buttons with `aria-pressed`, three main selections and one bonus, a visible selection count, Quick Pick, editable lines, "Repeat these numbers" (labelled quantity with the note that repeats do not improve the odds) and "Generate N different entries" (`generateDistinct`, always distinct from the basket). A fourth main choice is disabled until a selected number is removed. Invalid quantity gets an announced error and focus.
- **Baskets (`.ticket-slip`, `budget.ts`)**: one basket per game and round (`basketKey`), held in app state so drafts survive navigation. The game switch shows a `.count-dot` with the saved count per basket; switching only changes which basket is displayed. The totals list shows price, tickets, subtotal, estimated fee, all-in total and remaining budget (`.over` turns the remaining value `--error`). A closed round shows a notice and disables review. Review lists game, round, entries and the all-in ETH/USD total with one "Confirm demo entries" action; the rejected-approval demonstration is an optional `<details>` checkbox.
- **Receipt (`.receipt`)**: "Your demo entries are in" with the entry globes, ticket count, ETH + USD amount, local closing time and live countdown, then "View your draw", "My tickets" and an iCalendar download (`calendarEvent`, generated on click). No result time is promised.
- **`Modal`**: native `<dialog>` via `showModal()`, accessible heading, Escape handling, top-layer focus containment and return to the trigger on close. Content scrolls inside the viewport. Pending actions cannot be dismissed until the short operation resolves. Persistent errors are not timed toasts.
- **Globe reveal (`Chamber.tsx`, `reveal.ts`, `.rg*` styles)**: the lazy-loaded `RevealStage` renders one `RevealGlobe` at a time inside a 700px-perspective stage (`--size` 170px desktop, 140px ≤760px). The sphere is CSS: a shaded plush ball (`.rg-sphere`, inset lighting), a continents layer that pans across the curved surface (`.rg-continents`, data-URI SVG, pink on ice-blue or cream on pink for the bonus) and an edge-darkening `.rg-shade`. The cream badge is attached in 3D on the sphere front (`translateZ`, `backface-visibility: hidden`) inside `.rg-badge-stage`, which starts at `rotateY(180deg)` so the number faces away. Phases: `away` (enter, badge hidden) → `spinning` (`rg-turn` 540° and `rg-pan` over `--spin` 1500ms, `cubic-bezier(0.16, 0.7, 0.2, 1)` deceleration) → `hold` (850ms, badge facing the camera with a soft ring) → `travel` (450ms transform into its `#slot-n` result globe). Pause sets `animation-play-state: paused`. Reduced motion (`timing(true)`): no spin or travel, 120ms static reveals. `revealView` gates numbers, matches, payouts, winner and the live region until the bonus ball has stopped.
- **Draw room (`DrawRoom.tsx`)**: user-started replay only, 1.1-second fixture event steps before and after the reveals, pause/resume, replay, skip (disabled once finished) and reduced motion. Customer statuses come from `customerStatus` ("Preparing the draw", "Waiting for confirmed numbers", "Selecting the winning ticket"); contract event names live in the "Verification details" disclosure. Sound is muted by default; the tone and `speechSynthesis` callouts run only after the user enables sound. Below the stage, "Your tickets in this round" lists the customer's entries and labelled sample tickets with `.hit` rings (ice for main, pink for bonus) that appear as each ball stops, and a per-ticket textual outcome once complete. The `.finale` surface (pink gradient, "One of these matching tickets wins the whole collection.") lists `.ticket-chip` IDs, rectangular and dashed so they never read as 1–20 balls, paginated six per page, and shows `.finale-winner` only after `TieBreakResult`. `core.ts` supplies the deterministic event reducer; animation never determines numbers or winners.
- **My tickets (`Tickets.tsx`)**: two `.ticket-section`s, "Your demo entries" (`source: "mine"`, with closing time and the "Did my ticket win?" link that advances the open round into a labelled fixture replay with simulated time) and "Sample winners, refunds and rewards" (`source: "sample"`). Game/round filters, clear-filter empty state, textual statuses and native claim dialogs. The default NFT claim succeeds and shows a receipt with illustrative thumbnails (`.asset-outcomes`, small globes, "Illustrative artwork" caption); failed delivery, incompatible recipient and retry are under the "Demo scenarios" disclosure. The parent `ClaimMemory` persists partial claims and reward delivery across route changes in the same page session. Reload starts a fresh demo.
- **Disclosures**: native `<details>/<summary>` for FAQ, provenance, accounting, result and custody details. Detailed technical proofs are expandable, not primary navigation clutter.
- **Live workspace (`LiveWorkspace.tsx`)**: separately lazy-loaded and unavailable without verified configuration. Its controls reuse the same field, dialog, row and button patterns. It is typed and includes ABI-based claims but was not visually or financially exercised against a genuine deployment.

## Do's and Don'ts

Start a new page inside `.main` with `PageHead`, then reuse the existing content grid, `Globe` and action styles. Keep important copy in normal flow; use section spacing before adding another bordered surface. Keep the original wordmark and ice-blue icon, local assets, cream-readable text, distinct pink bonus and textual game labels.

Keep every money figure in ETH first with the USD approximation labelled illustrative, derived from wei through `usdCents`; never add a live quote or a second rate. Keep the exact tagline and persistent demo boundary. Label synthetic data at its point of use. Never show a provisional NFT match as a winning ticket, queueing as delivery, a pending pull as a secured NFT, or a timer as a source of randomness. Preserve explicit reduced-motion, sound and replay controls.

Do not show the brand board's “BRAND CONCEPT 01” label or superseded pink logo. Do not create guessed deployments, external NFT valuations, animated jackpots, endorsements or a competing dashboard aesthetic. A new interactive control needs a native semantic element, visible focus, a clear label and a recovery path for failure.

Design guidance attribution and licenses: `web/THIRD_PARTY_NOTICES.md` and `web/licenses/better-interface.txt`.
