---
title: Tsunami UI/UX revamp + smart track-swap + name-before-save
status: proposed
created: 2026-06-14
---

# Tsunami UI/UX Revamp

## Context

Tsunami solves a real problem well — generating playlists tailored to your taste
(create / enhance / run) over a local BPM-aware recommender and TIDAL. But the
interface reads like a developer tool: dense header, flat cards, inconsistent
spacing/typography, and a few interactions that under-deliver. This work keeps the
proven **create / enhance / run** information architecture and does three things:

1. **A focused, "pro-tool" visual + motion glow-up** (Linear-style: restrained
   neutral ramp, one teal accent, crisp type, generous spacing, tasteful
   micro-interactions). Functionality stays the hero; joy comes from polish and
   responsiveness, not decoration.
2. **Smart track swapping** — skipping a track currently just removes it and
   silently regenerates the whole list. Instead, removing a track first offers
   3–5 alternatives that fit *that slot*, with "Swap in" or "Remove entirely."
   Available in all three modes.
3. **Name-before-save** — the editable title already exists but is under-discovered
   and the run-mode default is an ugly config string. Make naming obvious and give
   every mode a clean, sensible default.

### Design decisions (confirmed with user)
- **Aesthetic:** Clean & focused (Linear-style).
- **Scope:** Polish the existing IA + ship the two new features (no flow rewrite).
- **Swap availability:** All modes. Run uses the instant local recommender;
  create/enhance use a single TIDAL radio call.

---

## Part A — Visual + motion polish (Linear-style)

Goal: one coherent design system applied across existing components; no structural
change to the page flow.

### A1. Design tokens — `app/globals.css`
- Add a tokens layer: neutral ramp (lean on `zinc`), a single accent (`teal`),
  standard radii (sm/md/lg/xl), spacing rhythm, and 1–2 elevation shadows.
- Add reusable keyframes already partly present (`fadeUp`, `eq`) plus a subtle
  `springIn` for cards and a focus-ring utility. Standardize transition timing
  (e.g. 150ms ease for interactive, 300ms for layout collapse).
- Define a `.focus-ring` and `.card` utility so components stop hand-rolling
  `border-zinc-800/60 bg-zinc-900/...` ad hoc.

### A2. Header — `app/page.tsx` (lines ~427–465)
- Reduce noise: keep wordmark, sync chip, user chip, but unify them into one
  quiet right-aligned cluster with consistent pill styling and tabular-nums for
  the track count. Sync status becomes a single calm affordance (idle ↻ / spinner
  / progress), reusing existing `triggerSync` logic untouched.

### A3. Components — apply tokens + tighten, file by file
Pattern (same treatment, don't enumerate every line): replace ad-hoc card/border
classes with the shared `.card`/`.focus-ring` utilities, normalize text sizes to
the type scale, add consistent hover/active/press states and focus rings, and add
entrance motion where lists/panels appear.
- `components/TrackCard.tsx` — crisper accepted/pending states, steadier
  album-art fallback, refined action buttons (see Part B for reject→swap).
- `components/PlaylistView.tsx` — header hierarchy + title affordance (Part C).
- `components/RunnerConfig.tsx` — align inputs/segmented controls to tokens.
- `components/MoodSelector.tsx` — keep the wheel (signature + functional) but
  tune contrast/selected glow to fit the restrained palette.
- `components/FeedbackBar.tsx`, `GeneratingView.tsx`, `PlaylistPicker.tsx`,
  `ConnectTidal.tsx` — token pass, consistent spacing, focus states.

No logic changes in Part A — purely presentational.

---

## Part B — Smart track swapping (all modes)

When the user clicks ✕ on a track, show an inline panel with 3–5 alternatives that
suit that slot, each with **Swap in**; plus **Remove entirely** and **Cancel**.

### B1. New endpoint — `app/api/alternatives/route.ts`
Request: `{ mode: 'run'|'create'|'enhance', removedTrackId: string,
neighborIds?: string[], excludeIds: string[], runConfig?: RunConfig }`
Response: `{ alternatives: Track[] }` (each with `cover_url`, `tidal_url`,
`reason`).

- **run strategy (instant, offline):** look up the removed track's BPM via
  `getTracksByIds([removedTrackId])` (`lib/db.ts`); build BPM windows around *its*
  bpm (`±8`) and call `recommend({ bpmRanges, limit: ~12, maxPerArtist: 2 })`
  (`lib/recommender.ts`). Filter out `excludeIds`, map `LibraryTrack → Track`
  (fields already present), attach a `reason` ("~158 BPM half-time — fits the
  same stride"), return top 5. Falls back to `runConfig` windows if the removed
  track isn't in the local library.
- **create/enhance strategy (one TIDAL call):** seed
  `getBatchRecommendations([removedTrackId, ...neighborIds.slice(0,2)], 10)`
  (`lib/tidal.ts`), flatten + dedupe, drop `excludeIds` and the seeds, map
  `RawTrack → Track` (`{ tidal_id: id, tidal_url: url }`), return top 5.
- Empty result → return `[]`; the UI handles the fallback gracefully.

### B2. New component — `components/SwapAlternatives.tsx`
- Renders inline under the track being swapped: loading state → 3–5 compact
  candidate rows (art / title / artist / reason + **Swap in**), then a footer
  with **Remove entirely** and **Cancel/Keep it**.
- Empty state: "No close matches — remove it?" with Remove/Cancel only.

### B3. `components/TrackCard.tsx`
- ✕ no longer rejects directly; it requests alternatives and marks the card as
  "swapping" (dim + accent edge). When swapping, render `SwapAlternatives` beneath
  it. ✓ and Play unchanged.

### B4. State + handlers — `app/page.tsx`
Replace `handleRejectAndRefresh` (the current reject-then-debounced-regenerate)
with swap flow:
- New state: `swapForId: string | null`, `alternatives: Track[]`,
  `loadingAlternatives: boolean`.
- `requestAlternatives(track)` — POST `/api/alternatives` with `mode`,
  `removedTrackId`, `neighborIds` (the ±1 neighbors in `tracks`), and
  `excludeIds` (all current `tidal_id`s + rejected), plus `runConfig` in run mode.
- `swapTrack(oldId, alt)` — replace the track in `tracks` **at the same index**
  with `alt` (status `accepted`), preserving neighbors so flow holds; clear panel.
  (Insert-in-place rather than re-sequencing the whole list, so the rest of the
  ordering the user already saw doesn't shuffle.)
- `removeTrack(id)` — set status `rejected` (existing collapse animation), no
  regeneration; clear panel.
- Existing accept/reject feedback logging (`logFeedback`) still fires via the
  generation routes; a removed-track reject can be folded into the next generate
  call's `rejectedIds` as today.

Edge cases: dedupe against current + rejected ids; guard against double-swap;
graceful empty-alternatives fallback.

---

## Part C — Name before save

The mechanism exists (`PlaylistView` title state → `onSave(title)` →
`/api/save` → `createPlaylist(title,…)`); make it discoverable and give good
defaults.

- `components/PlaylistView.tsx`
  - Make the title obviously editable: a labelled field ("Playlist name") with a
    pencil affordance and clear input styling, instead of text that merely looks
    like a heading.
  - **Default name helper** `defaultPlaylistName(mode, mood, runConfig)`:
    - run → `"5K Run · 158 BPM · Jun 2026"` (derive distance/BPM from `RunConfig`,
      not the raw `label` string `"5 km at 5:00/km (158 BPM)"`).
    - create → mood title + month (existing `MOOD_TITLES`), e.g.
      `"Deep Focus · Jun 2026"`; fallback `"Tsunami Mix · Jun 2026"`.
  - Track a `userEditedTitle` flag so regeneration doesn't clobber a name the user
    typed (current `useEffect` resets the title on every mood/default change).
- Enhance mode unchanged (adds to an existing playlist — no rename needed).

---

## Files

| File | Change |
|------|--------|
| `app/globals.css` | NEW design tokens, utilities, keyframes |
| `app/page.tsx` | swap state + handlers; default-name wiring; header polish |
| `components/SwapAlternatives.tsx` | **NEW** alternatives panel |
| `app/api/alternatives/route.ts` | **NEW** run + create/enhance strategies |
| `components/TrackCard.tsx` | reject→swap trigger, swapping state, polish |
| `components/PlaylistView.tsx` | title affordance + default-name helper |
| `types/index.ts` | `AlternativesRequest` / `AlternativesResponse` types |
| `components/{RunnerConfig,MoodSelector,FeedbackBar,GeneratingView,PlaylistPicker,ConnectTidal}.tsx` | token/polish pass |

### Reused (no new code needed)
- `recommend()` + `CandidateFilter.bpmRanges` — `lib/recommender.ts`
- `getTracksByIds()` — `lib/db.ts`
- `getBatchRecommendations()`, `createPlaylist()` — `lib/tidal.ts`
- Existing `parseTracksFromMessage` / `Track` mapping conventions — `lib/claude.ts`

---

## Verification

1. `npm run dev` (boots tidal-mcp on :5100 + Next). Connect TIDAL.
2. **Run swap (offline path):** generate a run playlist → ✕ a track → 3–5
   BPM-matched alternatives appear instantly → Swap in one → confirm it lands in
   the same slot and the rest of the order is unchanged.
3. **Create swap (TIDAL path):** generate from a mood → ✕ → alternatives arrive
   from radio → Swap in; also confirm **Remove entirely** still collapses the row.
4. **Empty/edge:** force no-match (obscure BPM) → fallback message + Remove works.
5. **Naming:** open a generated playlist → title is clearly editable with a clean
   default (run shows "5K Run · 158 BPM · …"); edit it, Save to TIDAL, Open in
   TIDAL, confirm the saved name matches; regenerate and confirm a user-typed name
   is preserved.
6. Visual pass: spot-check header, cards, mood wheel, runner config, generating
   view for consistent spacing, focus rings, and motion.
