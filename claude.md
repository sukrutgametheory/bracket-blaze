# Claude's Understanding: Racquet Tournament Manager MVP

## Project Overview
Building a full-stack tournament management platform for racquet sports (badminton, squash, pickleball, padel) that can handle 32-370 entrants across 2-3 divisions on 4-7 courts simultaneously.

## Core Problem
Tournament directors currently struggle with chaos during multi-division events: late arrivals, court juggling, manual scoring, player conflicts (same person in multiple divisions), and scheduling delays. This platform provides a unified control surface to eliminate that chaos.

## Four Primary User Interfaces

### 1. Admin/TD Console (Tournament Director's Command Center)
The main control screen where the tournament director:
- **Sets up** tournaments (courts, divisions, formats, scoring rules)
- **Manages seeding** (random + manual drag-to-override)
- **Assigns matches to courts** via drag-drop
- **Handles conflicts** (player double-booking across divisions)
- **Enforces rest periods** (default 15 min warning, configurable)
- **Signs off** on completed matches before advancing rounds
- **Manages check-ins** (search or QR code)
- **Handles late additions** (before R1 concludes)
- **Publishes** draws and results

### 2. Referee App (Phone-First PWA)
Simple scoring interface for officials:
- Attach to match via QR code or match code
- Large touch targets: **+1 A**, **+1 B**, **Undo**
- Clear server indicators
- Game/set/tiebreak transitions
- Submit match for TD sign-off
- Offline tolerance with local queue

### 3. Court TV (Per-Court Display)
Public scoreboard for each court:
- High-contrast display showing current match score
- Player/team names
- Game/set indicators
- Server visualization
- "Up Next" single match preview
- Kiosk mode with URL parameter (`?court=C3`)

### 4. Player Portal (Mobile-First)
For players and spectators:
- **My Matches** view with court assignments
- Live draws and standings
- Results timeline per division
- Real-time updates

## Tournament Formats (MVP)

### 1. Swiss → Knockouts
- Configurable Swiss rounds (3-5), then top N advance to single-elimination
- Smart pairing: avoid repeat opponents, match similar scores
- **Tie-breaks**: Wins → Points Diff → Points Scored → H2H → Coin Toss

### 2. Mexicano (Padel Style)
- Dynamic pairing each round based on performance
- Avoids repeat partners/opponents
- Converges toward balanced competition
- Same tie-break hierarchy for playoff seeding

### 3. Group Stage → Knockouts
- Groups of 3-6 players
- Round-robin within groups
- Top K advance to single-elimination
- Same tie-break hierarchy

**Important**: Late adds allowed only **before Round 1 concludes** and apply to next-round pairings (no retroactive changes).

## Sport-Specific Scoring Rule Packs

### Badminton
- Best of 3 games to 21 points
- Win by 2, cap at 30
- Ends switch per game and at 11
- Doubles service order tracking

### Squash
- PAR scoring to 11
- Win by 2
- Best of 5 games
- 90-second intervals

### Pickleball
- Configurable target: 11/15/21 points
- Win by 2
- Doubles service/receiver order
- Rally or side-out scoring (configurable per division)

### Padel
- Traditional tennis scoring (0-15-30-40)
- Deuce/advantage
- Tiebreak at 6-6
- Ends swap every odd game

All require: `+1 A`, `+1 B`, `Undo`, `Start Game/Set`, `End Game/Set`, `WO/Retire`, `Submit Match`

## Critical Features

### Conflict Engine
Detects when a player is:
- Already assigned to a match on another court
- In multiple divisions with overlapping matches
Shows warnings with details; TD can override with reason

### Rest Guardrails
- Default: 15-minute minimum rest between matches
- **Warning-only** (non-blocking)
- Configurable at tournament setup
- TD can override with reason code

### Check-In System
- Search by name/ID or QR scan
- Marks players as Present
- Late entrants flagged as Pending
- Staged for next-round inclusion if added before R1 completes

### Real-Time Everything
- Live score updates to all screens
- Instant draw/bracket updates
- Court assignment changes propagate immediately

## Tech Stack

### Frontend
- **Next.js 14+ (App Router)** on Vercel
- Server-side rendering for draws/TV
- Client rendering for real-time scoring
- Mobile-first, responsive design

### Backend
- **Supabase** (Postgres, Auth, Realtime, RLS)
- Edge Functions for heavy computations (pairings, standings)
- Row-Level Security for access control

### State & Data Management
- **TanStack Query** for server state
- **Zod** for validation
- **Server Actions** for mutations
- Realtime subscriptions for live updates

### Key Data Model Concepts
- `tournaments` → `divisions` → `entries` → `matches`
- `match_events` as immutable audit log
- `matches.meta_json` for cached derived state
- `standings` materialized view per round
- `courts`, `teams`, `participants`, `checkins`, `official_assignments`

## User Roles & Permissions (RLS)

- **TD/Desk**: Full control within tournament scope
- **Referee**: Write match_events for assigned match, read that match
- **Player/Spectator**: Read-only public draws/matches/standings

## Scoring Engine Architecture

Unified interface with sport-specific implementations:
```typescript
interface ScoringEngine {
  start(config): MatchState
  increment(side: 'A' | 'B', state): MatchState
  undo(state): MatchState
  completeAllowed(state): boolean
  winner(state): 'A' | 'B' | null
  derived(state): { server, game, set, tiebreak }
}
```

Separate engines: `badmintonEngine`, `squashEngine`, `pickleballEngine`, `padelEngine`

## Success Metrics
- **Court utilization**: ≥85% during peak hours
- **Punctual starts**: ≥80% within 10 minutes of target
- **Conflict resolution**: <30s median from warning to assignment
- **Ref accuracy**: <0.5% corrections post sign-off
- **TD satisfaction**: ≥8/10 post-event

## Development Phases (11-15 weeks)

### ✅ Phase 1: Foundations (COMPLETED)
**Duration**: 2 weeks
- ✅ Next.js 15.1.3 + TypeScript setup
- ✅ Supabase integration (Auth, Database, Realtime)
- ✅ shadcn/ui component library
- ✅ Authentication (login/signup)
- ✅ Database schema with `bracket_blaze_` prefix
- ✅ Row-Level Security policies
- ✅ GitHub auto-sync on commit
- ✅ Vercel deployment pipeline

### ✅ Phase 2: Core Setup (COMPLETED)
**Duration**: 3 weeks
**Completed Features**:
1. ✅ **Tournament Management** - CRUD for tournaments (name, venue, timezone, rest window)
2. ✅ **Court Management** - Add/edit courts with active/inactive status
3. ✅ **Division Management** - Create divisions with:
   - Sport selection (Badminton, Squash, Pickleball, Padel)
   - Format selection (Swiss, Mexicano, Groups+Knockout)
   - **Even draw sizes enforced** (2-512 players)
   - **Format-specific configuration**:
     - Swiss: rounds (3-10), qualifiers for knockout
     - Groups: group count, qualifiers per group
     - Mexicano: rounds (3-20), qualifiers for playoff
4. ✅ **Participant Management** - Register players with contact info
5. ✅ **Entry Management** - Assign participants to divisions:
   - Prevents duplicate entries (same player in same division)
   - Enforces draw size limits
   - Optional seeding (manual or auto-assign)
   - Shows entry count (12/16)

**Key Decision**: Two-step participant registration workflow
- Step 1: Add participants to tournament (creates player pool)
- Step 2: Assign participants to divisions via entries (with seeding)
- Rationale: Allows bulk import, pre-registration before divisions finalized, same participant in multiple divisions

### 🚧 Phase 3: Draw Generation & Scheduling (NEXT)
**Estimated Duration**: 3-4 weeks
**Planned Features**:
1. **Draw Generation Engines**
   - Swiss pairing algorithm (avoid repeats, match by score)
   - Mexicano dynamic pairing (performance-based)
   - Groups round-robin + knockout bracket
   - Seeding and bracket generation

2. **TD Control Center**
   - Ready Queue (prioritized matches waiting for courts)
   - Court Grid (visual court status)
   - Auto-assignment with manual override (greedy algorithm)
   - Drag-drop match-to-court assignment

3. **Conflict Detection Engine**
   - Runtime detection at assignment time
   - Player overlap check (same player on different court)
   - Rest period warnings (15 min default, non-blocking)
   - Court availability check

4. **Match Timing & Assignment**
   - Database additions: `assigned_at`, `actual_start_time`, `actual_end_time`
   - Conflict tracking table with override reasons
   - Court assignment audit log

**Key Decisions for Phase 3**:
- ✅ All divisions share all active courts (no court preferences in MVP)
- ✅ Auto-assignment with manual override (not manual-only)
- ✅ Runtime conflict detection (not preventive at draw generation)
- ✅ Build as complete Phase 3 milestone (after Phase 2 complete)

### Phase 4: Scoring & TV (Future)
- Referee app with sport-specific scoring
- Match events (immutable audit log)
- TD sign-off workflow
- Court TV display

### Phase 5: Player Portal (Future)
- My Matches view
- Live draws and standings
- Results timeline

### Phase 6: Polish & Ops (Future)
- Admin UX improvements
- Load testing
- Exports and reporting

## Key Architectural Decisions

### Database Design
**Decision**: Prefix all tables with `bracket_blaze_`
- **Rationale**: Avoid naming conflicts in shared Supabase projects, clear identification
- **Implementation**: All tables, types, and indexes use prefix
- **Tables**: tournaments, courts, divisions, participants, teams, entries, matches, etc.

**Decision**: Separate `participants` and `entries` tables
- **Rationale**: Participants are tournament-scoped player pool, entries link participants to specific divisions
- **Benefit**: Same participant can be in multiple divisions with different seeds
- **Flow**: Create participant → Create entry (participant + division + seed)

**Decision**: Match-court relationship already exists (`matches.court_id`)
- **Finding**: Schema already includes court assignment capability
- **Benefit**: Foundation for scheduling system already in place

### Division Configuration
**Decision**: Enforce even draw sizes only (2, 4, 6...512)
- **Rationale**: Bracket generation requires power-of-2 or even numbers for fair pairings
- **Implementation**: Zod validation with `refine((val) => val % 2 === 0)`

**Decision**: Store format-specific config in `rules_json`
- **Examples**:
  - Swiss: `{ swiss_rounds: 5, swiss_qualifiers: 8 }`
  - Groups: `{ groups_count: 4, group_qualifiers_per_group: 2 }`
- **Rationale**: Flexible schema, easier to extend with new formats
- **Usage**: Drives draw generation and leaderboard highlighting

### Scheduling Architecture
**Decision**: All divisions share all active courts (no court preferences for MVP)
- **Alternative considered**: Division-specific court assignments
- **Rationale**: Maximizes court utilization, simpler MVP, TD can override as needed
- **Future**: Add court preferences in Phase 4 if needed

**Decision**: Auto-assignment with manual override
- **Alternative considered**: Manual-only or both modes with toggle
- **Rationale**: Best balance of automation and TD control, greedy algorithm reduces TD workload
- **Implementation**: System auto-assigns highest priority match to free court, TD can drag-drop to override

**Decision**: Runtime conflict detection (not preventive at draw generation)
- **Alternative considered**: Smart draw generation to avoid conflicts
- **Rationale**: Simpler draw algorithms, flexibility for player withdrawals/late adds
- **Implementation**: Check conflicts when TD assigns match to court, allow override with reason

**Decision**: Rest period warnings only (non-blocking)
- **Per PRD**: 15-minute rest is warning-only, not hard enforcement
- **Rationale**: TD knows context (player requested, tournament running behind, etc.)
- **Implementation**: Show warning with override reason input

### Data Flow
**Critical Path**: Tournaments → Courts → Divisions → Participants → **Entries** → Matches → Scheduling
- **Without entries**: Cannot generate matches (matches need entry IDs)
- **Entry = participant + division + seed**: Represents a player's registration in a specific competition

### UI/UX Patterns
**Decision**: Two-step participant registration
- **Step 1**: Add all participants to tournament (player pool)
- **Step 2**: Assign participants to divisions via entry management
- **Rationale**:
  - Allows bulk import of participants
  - Pre-registration before divisions finalized
  - Clear separation for multi-division tournaments
  - Easier to manage large player lists

**Decision**: Separate management pages for each entity
- **Pattern**: `/tournaments/{id}/courts`, `/tournaments/{id}/divisions`, `/tournaments/{id}/participants`
- **Entry management**: Nested under division `/tournaments/{id}/divisions/{divisionId}/entries`
- **Rationale**: Clear hierarchy, focused workflows, easier navigation

## Out of Scope for MVP (V2 Features)
- Division-specific court preferences (all courts shared for now)
- Smart draw generation to prevent conflicts (runtime detection only)
- Division start time scheduling (priority-based only)
- Court utilization analytics
- Payments (Razorpay integration)
- WhatsApp notifications
- Dispute workflow
- Injury timeouts/cards
- Court TV rotation
- Calendar feeds
- Live streaming integrations
- Complex seeding algorithms (manual/auto-assign only)
- Hard rest enforcement (warning-only in MVP)
- Match SLA tracking
- "On deck" player notifications

## Key Risks & Mitigations

**Multi-division conflicts at scale**
→ Surface early in Control Center, quick override with reason codes

**Late adds destabilizing Swiss R1**
→ Only allow next-round insertion, never rewrite completed pairings

**Ref device/network variability**
→ Large touch targets, local queue, visible sync status, offline tolerance

## UX Principles
1. **Speed**: Minimize TD clicks per court assignment (>60% reduction vs spreadsheets)
2. **Clarity**: High-contrast displays, clear conflict warnings
3. **Confidence**: Sign-off workflow, undo capability, audit trail
4. **Visibility**: Real-time updates across all interfaces
5. **Flexibility**: Override guardrails with reasons when necessary

## Nice-to-Have Enhancements
- "On deck" label when player's prior match ends
- Override reason codes for analytics
- Per-division color accents for wayfinding
- Match SLA tracking and drift metrics

---

## My Understanding Summary

This is a sophisticated event management platform designed to bring order to the chaos of multi-court, multi-division racquet sports tournaments. The key insight is that tournament directors need a **single pane of glass** to orchestrate complex scheduling while managing conflicts, rest periods, and real-time scoring across dozens of simultaneous matches.

The MVP focuses on the **core workflow loop**:
1. TD sets up tournament → generates draws
2. Players check in
3. TD assigns matches to courts (with conflict/rest warnings)
4. Refs score matches with simple controls
5. TD signs off → winners advance → next round generated
6. Repeat until tournament complete

The platform must handle the reality that players compete in multiple divisions, requiring intelligent conflict detection and flexible scheduling. The 15-minute rest warning (not enforcement) strikes a balance between player wellness and tournament flow.

The technical architecture leverages modern serverless (Vercel + Supabase) for real-time capabilities without infrastructure complexity. The event-sourced scoring (via `match_events`) provides an audit trail while cached state enables fast reads.

Success means a TD can run a 200+ person, 7-court tournament smoothly while keeping rounds on schedule and courts utilized efficiently.
