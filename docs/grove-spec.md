# The Grove — idle-layer spec

An idle-game layer for Sprig. Every deck is a plant; real SRS state drives growth,
absence produces a collectible resource ("dew"), and every sink loops back into
studying. Studying is the engine — the grove only ever visualizes and rewards it.

Design language: white monochrome slate, line-art plants in the existing
`GrowingPlant`/`FocusPlant` style, Lucide icons only (`Droplet` for dew,
`Sprout`/`TreePine`-family for stages). No green theme, no emojis.

Variety: `GrowingPlant` supports several species (classic flower, tulip,
bellflower, daisy, berry bush); each deck is deterministically assigned one by
hashing its id (`speciesForDeck`), so a deck always grows the same variety.

---

## 1. Plant state (derived, never stored)

Each CSV deck with at least 1 card is a plant. All plant state is computed from
`srsData` at render time — the grove never duplicates SRS data.

**Definitions** (per deck, at time `now`):

| Term | Definition |
|---|---|
| reviewed | cards with an `srsData` entry |
| mature | cards with `interval >= 21` days (Anki convention) |
| due | reviewed cards with `nextReview <= now` |
| maturity | `mature / totalCards` (0 when totalCards = 0) |
| backlog | `due / max(1, reviewed)` |

**Growth stage** (from maturity):

| Stage | Maturity | Dew rate (per hour) |
|---|---|---|
| Seed | no cards reviewed yet | 0 |
| Sprout | < 25% | 2 |
| Sapling | 25–59% | 4 |
| Young tree | 60–89% | 7 |
| Flourishing | 90–99% | 10 |
| Blossoming | 100% | 12 |

**Wilt** is an overlay, not a stage. A plant droops when `backlog >= 0.5` and
`due >= 10` (both conditions, so tiny decks don't flicker). A wilted plant
produces 0 dew but **keeps its stage** — growth never regresses from absence.
Copy must read as paused, not dying: "resting", never "wilting/dead". Plants
droop; they do not die. Clearing the due cards restores production immediately.

Decks with an `examDate` get a small countdown badge on their plant — the race
to bloom before the exam is the emotional core for exam users.

## 2. The dew economy

### Income

**Idle accrual** — computed on grove open, classic idle-game style; no
background processing:

```
elapsedHours = min(now - lastCollectedAt, 12h) / 1h
dew = floor(elapsedHours × Σ plantRate × streakMultiplier)
```

- `plantRate`: table above; wilted plants contribute 0.
- `streakMultiplier`: 1.0 base, 1.25 at streak ≥ 7, 1.5 at streak ≥ 30.
- **12 h cap**: the optimal habit is opening daily, not hoarding absence.
- Rates are evaluated at collect time from current state (no historical
  integration — accepted simplification, invisible in practice).

**Session burst**: finishing a swipe/quiz/type/feed session grants
`1 dew × cards reviewed`, capped at 100/day (tracked next to `dailyReviews`).
Keeps active studying strictly better than idling, blocks grind abuse.

Reference income (established user, 5 decks averaging sapling/young-tree,
streak ≥ 7): idle ≈ `25/h × 1.25 × 12h` ≈ 375/day + bursts ≈ **400–500 dew/day**.
New users (1–2 sprouts) see ~50–80/day — small, but stage upgrades feel huge.

### Sinks (prices)

| Item | Price | Notes |
|---|---|---|
| Streak freeze | 1,500 | Second path to the existing mechanic; `MAX_STREAK_FREEZES = 3` still caps banking, purchase disabled at cap |
| Sunshine (2× XP for 30 min) | 400 | Time-boxed, non-stacking (stats updates are per-card, so "next session" has no clean boundary — a timed window does) |
| Planters/pots (cosmetic) | 250–1,000 | Per-deck assignment |
| Grove decorations (cosmetic) | 500–5,000 | Fences, stones, lanterns — grove-wide |
| Rare seed varieties | seeds only | See prestige; never buyable with dew |

**Hard rule:** dew never buys XP, levels, ranks, or SRS shortcuts. The moment
idle currency buys progression, studying becomes optional and the loop curdles.
Freezes (protective) and fertilizer (multiplies *studying*) are the only
non-cosmetic sinks, by design.

### Prestige: seeds

When a deck reaches Blossoming (100% mature), it can be **harvested once**:
+1 seed, a blossom animation, and a permanent small badge. Seeds unlock rare
plant varieties (visual only) usable on any deck. This is the app's first
reward for actually *finishing* a deck. A harvested deck that later drops below
100% keeps its badge but can't re-harvest until it blossoms again (max one
harvest per deck per 30 days — blocks tiny-deck farming).

## 3. Grove screen

New route `app/grove.tsx`, entered from the home tab (card or header button —
decide at build time). Layout: horizontal scrolling shelf (or 2-column grid for
many decks) of line-art plants on slate; each plant shows name, stage, droop
overlay, exam badge. Header: dew balance + collect button with count-up
animation when accrual > 0. Tapping a plant: bottom sheet with stage, maturity
%, due count, "Study now" (deep-link into swipe for that deck), and planter
picker (phase 3).

## 4. Storage

One JSON blob in the existing `kv` table, key `grove`:

```ts
interface GroveState {
  dew: number;
  lastCollectedAt: number;    // epoch ms
  burstDewToday: number;      // resets on date change
  burstDate: string;          // "YYYY-MM-DD"
  seeds: number;
  harvests: Record<string, number>;         // deckId -> last harvest epoch ms
  speciesOverrides: Record<string, number>; // deckId -> rare species planted with a seed
  planters: Record<string, string>;         // deckId -> pot style id; buying = assigning
  ownedDecorations: string[];               // purchased grove-wide backdrop ids
  equippedDecoration: string | null;        // which owned decoration is shown, if any
}
```

Reads/writes go through `Storage.ts` helpers (`getGroveState`,
`collectDew`, `spendDew`, …) using the existing `serialized()` write chain.
Included in `createBackup`/`importBackup` automatically once it lives in `kv`
(verify the backup exporter covers arbitrary kv keys; add `grove` if it
whitelists).

## 5. Phases

1. **Grove screen, read-only** — plant mapping, stages, wilt, exam badges. ✅
2. **Dew loop** — accrual + collect + session bursts + freeze & sunshine
   sinks; session summary shows XP/dew/boost earnings. ✅
3. **Prestige** — harvest a seed from a blossoming deck (30-day cooldown per
   deck), seeds plant rare varieties (Sunflower, Rose); stage-up
   celebrations on the grove screen and session summary. ✅
4. **Collection layer** — cosmetic planters/pots (per-deck, 250–1,000 dew),
   grove decorations (shelf-wide backdrop, 500–3,000 dew), rare varieties
   (Sunflower, Rose via seeds). ✅

## 6. Non-goals / guardrails

- No notifications from the grove (the streak reminder slot is enough; a
  "your dew is capped!" push is exactly the dark pattern to avoid).
- No dying plants, no lost growth, no decayed dew balance — absence pauses,
  never punishes.
- No real-money purchases anywhere in this system.
- Idle accrual never exceeds what an active studier earns; if tuning ever
  inverts that, cut idle rates, not burst rates.
