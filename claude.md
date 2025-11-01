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

1. **Foundations** (2-3 weeks): Auth, data model, RLS, CRUD operations
2. **Draws & Pairings** (3-4 weeks): Seeding, format engines, late-add logic
3. **Scoring & TV** (2-3 weeks): Ref app, events, sign-off, Court TV
4. **Scheduling & Conflicts** (2-3 weeks): Queue, drag-drop, conflict/rest warnings
5. **Player Portal** (1-2 weeks): Draws, standings, "My Matches"
6. **Polish & Ops** (1-2 weeks): Admin UX, load testing, exports

## Out of Scope for MVP (V2 Features)
- Payments (Razorpay integration)
- WhatsApp notifications
- Dispute workflow
- Injury timeouts/cards
- Court TV rotation
- Calendar feeds
- Live streaming integrations
- Complex seeding algorithms
- Hard rest enforcement (warning-only in MVP)

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
