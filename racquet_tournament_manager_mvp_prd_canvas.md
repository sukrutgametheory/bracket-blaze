# Racquet Tournament Manager — MVP PRD

## tl;dr
A tournament tool for badminton, squash, pickleball, and padel across 4–7 courts, 2–3 divisions, and ~32–370 entrants. Core surfaces: **Admin/TD console**, **Player portal**, **Referee app**, **Court TV**. Formats: **Swiss → knockouts**, **Mexicano**, **Group stage → knockouts**. Random seeding with manual override. Live scoring + court assignment. Simple check-in. **Conflict engine** + **rest guardrails** (**default 15 minutes**, warning-only, configurable at tournament setup). Payments (Razorpay), WhatsApp, and streaming in **V2**.

---

## Problem Statement
Running racquet events with multiple divisions and players in multiple brackets is chaotic: late/no-shows, court juggling, and manual scorekeeping cause delays and confusion. Directors need a single control surface to schedule, assign, and advance matches; referees need a dead-simple way to score; players need to know when/where they play and see live results.

---

## Scope & Assumptions
- **Courts**: 4–7.
- **Divisions**: 2–3 per tournament.
- **Entrants**: 32–370.
- **Players in multiple divisions**: common; conflict management required.
- **House rules**: defined at tournament setup.
- **No disputes/injury cards** in MVP.
- **Payments**: V2 (Razorpay); waivers captured with payment in V2.
- **Comms**: WhatsApp preferred (V2). No calendar feeds in MVP.
- **Court TV**: per-court scoreboard only (no rotation).
- **Ref devices**: personal phones; lightweight offline tolerance.
- **Check-in**: via Admin (search) and/or QR; no printed badges.

---

## Goals
### Business Goals
- Run a full-day tournament with 4–7 courts and 200+ entrants **smoothly**.
- Cut TD effort per match assignment by **>60%** vs spreadsheets/chats.
- Keep median schedule drift per round at **≤10 minutes**.
- Deliver a polished live experience that clubs want to reuse.

### User Goals
- **TD/Desk**: create draws, assign courts fast, resolve conflicts, advance rounds.
- **Ref**: score with **+1 / undo**, finish matches confidently.
- **Player/Spectator**: see draws, live results, who’s next, where.

### Non-Goals (MVP)
- Dispute workflow; injury timeout/cards.
- Court TV rotation; calendar feeds.
- External integrations & live streaming.
- Payments (until V2); WhatsApp (V2).
- Complex seeding/ranking beyond random + manual override.
- Hard rest enforcement (warnings only).

---

## Formats (MVP)
1) **Swiss → Knockouts**
   - Rounds: configurable (e.g., 3–5 Swiss rounds), then top N to single-elim playoff.
   - Pairing: avoid repeat opponents; pair near-equal scores; float if odd.
   - **Tie-break order**: **Wins → Points Differential → Points Scored → Head-to-Head → Coin Toss**.

2) **Mexicano (Padel style)**
   - Dynamic pairing to converge toward balanced play.
   - After each round, re-pair based on cumulative performance; avoid repeat partners/opponents.
   - Standings for seeding playoffs use the **same tie-break order** as above.

3) **Group Stage → Knockouts**
   - Groups of 3–6; round-robin; top K advance to single-elim.
   - **Tie-break order**: **Wins → Points Differential → Points Scored → Head-to-Head → Coin Toss**.

> **Late Add**: Allowed **before Round 1 concludes**. The system inserts entrants for the *next* pairing generation; no retroactive changes.

---

## Scoring Rule Packs (per sport)
- **Badminton**: Best of 3 to 21, win by 2, cap at 30; ends switch per game & at 11; doubles service order tracked (simplified UI).
- **Squash**: PAR to 11, win by 2, best of 5; 90s intervals.
- **Pickleball**: To 11/15/21 (config), win by 2; doubles service/receiver order; rally or side-out selectable per division.
- **Padel**: Games/sets (0-15-30-40), deuce/adv; tie-break at 6–6; ends swap every odd game.

**Mandatory ref UI controls:** `+1 A`, `+1 B`, `Undo`, `Start Game/Set`, `End Game/Set`, `WO/Retire`, `Submit Match`.

---

## Key Features & Requirements

### 1) Admin / TD Console (primary screen)
- **Tournament Setup Wizard**
  - Venue & courts (C1–C7).
  - Divisions: sport, format, draw size, rule pack.
  - **Seeding**: randomize + manual drag override.
  - **Rest Window (minutes)**: default **15**; warning-only (not blocking); configurable here.
- **Live Control Center**
  - Queue of “ready” matches; **drag-drop** to courts; assign officials.
  - **Conflict Engine**: detect bookings across divisions; show warnings with details.
  - **Rest Guardrails**: warn when < configured rest window; allow override with reason.
  - Late/No-show: quick WO; or mark **Late**; support **Late Add** staging.
  - Round advance: auto-place winners; lock/unlock round.
  - **Check-in panel**: mark present via search/QR.
- **Draws Manager**
  - Visual for Swiss/Groups/Brackets; edit seeds; insert late entrants (R1 not complete).
- **Publishing**
  - Toggle public visibility per division for draws & results.

### 2) Referee App (phone-first, PWA-lite)
- Attach via **QR** or match code.
- Large controls: `+1`, `Undo`; clear server indicator; game/set/tie-break flags.
- End game/match confirmation; submit for **TD sign-off**.
- **Offline tolerance**: local queue for brief drops; visible sync status.

### 3) Court TV (per court)
- High-contrast scoreboard: players/teams, game/set, current score, server.
- “Up Next on this Court” (single item).
- Kiosk URL param: `?court=C3` to lock view.

### 4) Player Portal (mobile-first)
- **My Matches**: current/next with court once assigned.
- **Draws & Standings**: Swiss tables, groups, brackets; live updates.
- **Results Timeline**: per division; simple and fast.

---

## User Stories (selected)
**Tournament Director / Desk**
- Create divisions with format & sport rules.
- Randomize seeds; **drag to override**.
- **Insert Late Entrant** before R1 completes; next-round pairings include them.
- See **conflicts** and **rest warnings**; override with reason; assign courts by drag-drop.
- **Sign-off** completed matches before advancing the draw.

**Referee**
- Attach to match via QR; score with +1/undo; finish and submit.

**Player / Spectator**
- View my next match & court; live draws/standings; see results and likely path.

---

## User Experience — Flows

### A) Setup → Check-in → First Serve
1. TD configures courts, divisions, formats, rule packs; sets **Rest Window = 15 min** (or custom).
2. TD randomizes seeds; tweaks via drag; publishes draws.
3. Desk marks players **Present** (search or QR). Late entrants flagged as **Pending**.
4. Start Round 1; “Ready” matches populate; TD drag-drops to courts.
5. Ref scans court QR → match attaches → scoreboard shows on Court TV.

### B) Live Ops
1. Ref taps +1/Undo; submits game/set/match.
2. TD **signs off** the result; winners advance; next-round pairings generated (format rules).
3. Conflict engine + rest guardrails annotate the Ready Queue; TD assigns accordingly.

### C) Late Add Before R1 Concludes
1. Desk adds entrant to division; system **stages** them for next pairing generation.
2. If uneven, BYE inserted per format rules.
3. UI tags “Late Add” in draw; completed pairings remain untouched.

---

## Success Metrics
- **Court utilization**: ≥85% during peak.
- **Punctual starts**: ≥80% within 10 minutes of target.
- **Conflict resolution**: <30s median from warning → assignment.
- **Ref scoring reliability**: <0.5% corrections post sign-off.
- **TD satisfaction**: ≥8/10 post-event pulse.

---

## Technical Considerations

### Architecture
- **Next.js (App Router)** on Vercel.
- **Supabase**: Postgres, Auth, Realtime, RLS. Functions for heavy tasks (pairings).
- **Data & State**: TanStack Query; Zod for input validation; Server Actions for mutations.
- **Realtime**: Subscribe to `match_events` / `matches` for Player/Court/Ref UIs.

### Data Model (MVP)
```sql
tournaments(id, name, venue, tz, status, rest_window_minutes default 15)

courts(id, tournament_id, name, is_active)

divisions(id, tournament_id, sport, name, format, rules_json, draw_size)

participants(id, user_id, display_name, club)
teams(id, division_id, name)
team_members(team_id, participant_id)

entries(id, division_id, participant_id, team_id, seed, status) -- active, withdrawn

draws(id, division_id, type, state_json) -- swiss/groups/bracket topology

matches(
  id, division_id, round, sequence,
  side_a_entry_id, side_b_entry_id,
  scheduled_at, court_id, status, winner_side, meta_json
) -- status: ready, on_court, complete

match_events(id, match_id, ts, actor_id, type, payload_json) -- point, game_end, match_end, undo, WO
official_assignments(id, match_id, user_id)

checkins(id, tournament_id, participant_id, present_bool, ts)

standings(
  id, division_id, entry_id,
  wins, losses, points_for, points_against, tiebreak_json
)
```

**Notes**
- `match_events` is the immutable audit log; `matches.meta_json` caches derived state (fast reads).
- `standings` materialized per round for Swiss/Groups; recomputed on completion.

### RLS & Roles
- **TD/Desk**: full within tournament scope.
- **Ref**: write `match_events` for assigned match; read that match.
- **Player/Spectator**: read-only public draws/matches/standings.

### Scheduling & Conflict Engine (MVP)
- **Greedy assignment** of the Ready Queue to open courts.
- Constraints:
  - **Player conflict across divisions** (same player on/near another match).
  - **Rest guardrail**: warns if < `rest_window_minutes` (default 15); **non-blocking**.
- When matches complete early/late, recompute Ready Queue and suggested ordering.
- (Optional) **Match SLAs** and drift tracking are nice-to-have, not required.

### Scoring Engine Interface (shared)
```ts
export interface ScoringEngine {
  start(config): MatchState;
  increment(side: 'A' | 'B', state): MatchState;
  undo(state): MatchState;
  completeAllowed(state): boolean;
  winner(state): 'A' | 'B' | null;
  derived(state): {
    server: 'A' | 'B';
    game: number;
    set: number;
    tiebreak?: boolean;
  };
}
```
Implementations: `badmintonEngine`, `squashEngine`, `pickleballEngine`, `padelEngine`.

### Court TV
- Route: `/court/[courtId]` (ISR + Realtime hydration).
- High-contrast Tailwind theme; large typography; server indicator; “Up Next” single slot.
- Kiosk param: `?court=C3` to lock.

### Performance & Reliability
- SSR for read-heavy pages (draws/TVs); client for ref scoring.
- Optimistic UI in ref app; reconcile on server ack.
- LocalStorage buffer for brief offline (ref app only).

---

## Milestones & Sequencing (indicative)
1. **Foundations (2–3 weeks)**  
   Auth, data model, RLS, tournaments/courts/divisions CRUD, rule packs.
2. **Draws & Pairings (3–4 weeks)**  
   Random seeding + manual override; Swiss/Mexicano/Groups engines; late-add handling.
3. **Scoring & TV (2–3 weeks)**  
   Ref app + scoring events + TD sign-off; Court TV; derived scoring.
4. **Scheduling & Conflicts (2–3 weeks)**  
   Ready Queue; drag-drop court assign; conflict + rest guardrails (warning-only).
5. **Player Portal & Publishing (1–2 weeks)**  
   Draws, standings, “My Matches”.
6. **Polish & Ops (1–2 weeks)**  
   Admin control tweaks; load testing with seeded data; audit exports.

---

## V2 (flagged)
- **Payments**: Razorpay registration + waiver capture; refunds/coupons.
- **WhatsApp**: Business API for “On deck in 10 min, Court 3”.
- **Streaming**: JSON scoreboard endpoint for OBS overlays.
- Deeper offline PWA for refs; solver-assisted scheduling; calendar feeds.

---

## Risks & Mitigations
- **Multi-division conflicts** at scale → surface early, prioritize in Control Center, quick override with reason codes.
- **Late adds** destabilizing Swiss R1 → only allow next-round insertion; never rewrite completed pairings.
- **Ref device/network** variability → big targets, fast feedback, local queue, visible sync state.

---

## Small, High-Leverage Enhancements
- **“On deck” label** in Player Portal once a player’s prior match ends.
- **Override reason codes** for analytics (why guardrails were bypassed).
- **Per-division color accents** across UI for instant wayfinding.

