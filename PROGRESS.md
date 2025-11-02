# Bracket Blaze - Development Progress

**Last Updated**: January 2, 2025
**Current Phase**: Phase 2 Complete ✅ → Moving to Phase 3
**Deployment**: https://bracket-blaze.vercel.app

---

## 📊 Overall Progress: 40% Complete

```
Phase 1: Foundations         ████████████████████ 100% ✅
Phase 2: Core Setup          ████████████████████ 100% ✅
Phase 3: Draw & Scheduling   ░░░░░░░░░░░░░░░░░░░░   0% 🚧
Phase 4: Scoring & TV        ░░░░░░░░░░░░░░░░░░░░   0%
Phase 5: Player Portal       ░░░░░░░░░░░░░░░░░░░░   0%
Phase 6: Polish & Ops        ░░░░░░░░░░░░░░░░░░░░   0%
```

---

## ✅ Phase 1: Foundations (COMPLETED - Week 1-2)

### Infrastructure
- [x] Next.js 15.1.3 with App Router and TypeScript
- [x] Supabase integration (PostgreSQL + Auth + Realtime)
- [x] shadcn/ui component library + Tailwind CSS
- [x] TanStack Query for server state management
- [x] Zod for validation
- [x] GitHub auto-sync on every commit
- [x] Vercel deployment with automatic CI/CD

### Authentication
- [x] Login page with email/password
- [x] Signup page with validation
- [x] Protected routes with middleware
- [x] Session management

### Database
- [x] Complete schema with `bracket_blaze_` prefix (13 tables)
- [x] Row-Level Security (RLS) policies
- [x] Custom types for enums (tournament_status, match_status, etc.)
- [x] Indexes for performance
- [x] Migration files ready

**Key Files**:
- `supabase/migrations/20250101000002_add_prefix.sql`
- `supabase/migrations/20250101000003_rls_policies_prefixed.sql`
- `supabase/migrations/20250102000001_add_tournament_id_to_participants.sql`

---

## ✅ Phase 2: Core Setup (COMPLETED - Week 3-5)

### 1. Tournament Management
**Route**: `/tournaments`
- [x] Create tournaments (name, venue, timezone, rest window)
- [x] List all tournaments with status badges
- [x] View tournament details
- [x] Edit tournament settings
- [x] Setup progress tracker on detail page

**Files**:
- `app/tournaments/page.tsx`
- `app/tournaments/[id]/page.tsx`
- `app/tournaments/new/page.tsx`
- `components/tournaments/tournament-form.tsx`
- `lib/actions/tournaments.ts`

### 2. Court Management
**Route**: `/tournaments/[id]/courts`
- [x] Add courts (C1, C2, etc.)
- [x] Edit court names
- [x] Toggle active/inactive status
- [x] Delete courts
- [x] Court count tracking

**Files**:
- `app/tournaments/[id]/courts/page.tsx`
- `components/courts/court-list.tsx`
- `components/courts/court-dialog.tsx`
- `lib/actions/courts.ts`

### 3. Division Management
**Route**: `/tournaments/[id]/divisions`
- [x] Create divisions with sport type (Badminton, Squash, Pickleball, Padel)
- [x] Select format (Swiss, Mexicano, Groups+Knockout)
- [x] Configure even draw sizes (2-512)
- [x] Format-specific settings:
  - [x] Swiss: rounds (3-10), qualifiers for knockout
  - [x] Groups: group count, qualifiers per group
  - [x] Mexicano: rounds (3-20), qualifiers for playoff
- [x] Edit divisions
- [x] Delete divisions
- [x] Display format details on list

**Key Decision**: Store format config in `rules_json` for flexibility

**Files**:
- `app/tournaments/[id]/divisions/page.tsx`
- `components/divisions/division-list.tsx`
- `components/divisions/division-dialog.tsx`
- `lib/actions/divisions.ts`
- `lib/validations/tournament.ts` (divisionFormSchema with validation)

### 4. Participant Management
**Route**: `/tournaments/[id]/participants`
- [x] Add participants (display name, club, email, phone)
- [x] Edit participant details
- [x] Delete participants
- [x] Participant list with club badges

**Key Decision**: Participants are tournament-scoped, not global

**Files**:
- `app/tournaments/[id]/participants/page.tsx`
- `components/participants/participant-list.tsx`
- `components/participants/participant-dialog.tsx`
- `lib/actions/participants.ts`

### 5. Entry Management ⭐ CRITICAL
**Route**: `/tournaments/[id]/divisions/[divisionId]/entries`
- [x] Assign participants to divisions
- [x] Optional seeding (1 to draw_size)
- [x] Entry count tracking (12/16)
- [x] Prevent duplicate entries
- [x] Enforce draw size limits
- [x] Seed conflict detection
- [x] Remove entries
- [x] Edit entry seeding

**Why This Matters**:
- Matches are generated from **entries**, not participants
- Entry = participant + division + seed
- Same participant can be in multiple divisions
- Foundation for multi-division conflict detection

**Files**:
- `app/tournaments/[id]/divisions/[divisionId]/entries/page.tsx`
- `components/entries/entry-list.tsx`
- `components/entries/entry-dialog.tsx`
- `lib/actions/entries.ts`

---

## 🚧 Phase 3: Draw Generation & Scheduling (NEXT - Week 6-9)

**Status**: Ready to start after Phase 2 complete
**Estimated Duration**: 3-4 weeks

### Required Database Changes
```sql
-- Add to matches table
ALTER TABLE bracket_blaze_matches ADD COLUMN assigned_at TIMESTAMPTZ;
ALTER TABLE bracket_blaze_matches ADD COLUMN assigned_by UUID REFERENCES auth.users(id);
ALTER TABLE bracket_blaze_matches ADD COLUMN actual_start_time TIMESTAMPTZ;
ALTER TABLE bracket_blaze_matches ADD COLUMN actual_end_time TIMESTAMPTZ;
ALTER TABLE bracket_blaze_matches ADD COLUMN estimated_duration_minutes INTEGER;

-- New table: match conflicts
CREATE TABLE bracket_blaze_match_conflicts (
  id UUID PRIMARY KEY,
  match_id UUID REFERENCES bracket_blaze_matches(id),
  conflict_type TEXT, -- 'player_overlap', 'rest_violation'
  severity TEXT, -- 'warning', 'error'
  details_json JSONB,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  override_reason TEXT,
  ...
);

-- New table: court assignments (audit log)
CREATE TABLE bracket_blaze_court_assignments (
  id UUID PRIMARY KEY,
  match_id UUID REFERENCES bracket_blaze_matches(id),
  court_id UUID REFERENCES bracket_blaze_courts(id),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,
  unassigned_at TIMESTAMPTZ,
  notes TEXT
);

-- Add to divisions table
ALTER TABLE bracket_blaze_divisions ADD COLUMN scheduling_priority INTEGER DEFAULT 5;
```

### Planned Features

#### 1. Draw Generation Engines
- [ ] Swiss pairing algorithm
  - Avoid repeat opponents
  - Match players by similar scores
  - Handle odd numbers (bye)
- [ ] Mexicano dynamic pairing
  - Performance-based partner/opponent rotation
  - Avoid repeats
- [ ] Groups round-robin + knockout
  - Distribute players into groups
  - Round-robin within groups
  - Top K advance to single-elimination
- [ ] Seeding logic (manual override + auto-assign)

**Files to Create**:
- `lib/services/draw-generators/swiss-engine.ts`
- `lib/services/draw-generators/mexicano-engine.ts`
- `lib/services/draw-generators/groups-engine.ts`
- `lib/actions/draws.ts`

#### 2. TD Control Center
**Route**: `/tournaments/[id]/control`

- [ ] Ready Queue component
  - List matches with status = 'ready'
  - Show division, round, participants
  - Priority indicators
  - Conflict warnings
  - Drag source for assignment
- [ ] Court Grid component
  - Visual grid of all courts
  - Current match on each court
  - Match progress indicator
  - Drop target for assignments
  - "Auto-Assign" toggle
- [ ] Conflict Modal
  - Show warnings/errors
  - Override reason input
  - "Assign Anyway" button
- [ ] Assignment History
  - Recent assignments log
  - Override reasons

**Files to Create**:
- `app/tournaments/[id]/control/page.tsx`
- `components/control-center/ready-queue.tsx`
- `components/control-center/court-grid.tsx`
- `components/control-center/conflict-modal.tsx`

#### 3. Conflict Detection Engine

- [ ] Player overlap detection
  - Check if participant in another on_court match
  - Return ERROR (blocks assignment)
- [ ] Rest period checker
  - Calculate time since last match ended
  - Return WARNING if < rest_window_minutes
  - Non-blocking (TD can override)
- [ ] Court availability check
  - Ensure court not occupied
  - Return ERROR if court in use

**Files to Create**:
- `lib/services/conflict-engine.ts`
- `lib/services/ready-queue.ts`

#### 4. Match Assignment Actions

- [ ] `assignMatchToCourt()` - with conflict checking
- [ ] `unassignMatch()` - free court
- [ ] `autoAssignNextMatch()` - greedy algorithm
- [ ] `startMatch()` - referee marks started
- [ ] `completeMatch()` - TD sign-off, trigger auto-assign

**Files to Create**:
- `lib/actions/match-assignment.ts`
- `lib/actions/match-status.ts`

#### 5. Real-Time Updates

- [ ] Supabase Realtime subscriptions
  - Subscribe to match changes
  - Subscribe to court changes
  - Auto-refresh Ready Queue
  - Update Court Grid instantly

---

## 📁 Project Structure

```
bracket-blaze/
├── app/
│   ├── auth/
│   │   ├── login/page.tsx          ✅
│   │   └── signup/page.tsx         ✅
│   ├── tournaments/
│   │   ├── [id]/
│   │   │   ├── courts/page.tsx     ✅
│   │   │   ├── divisions/
│   │   │   │   ├── page.tsx        ✅
│   │   │   │   └── [divisionId]/
│   │   │   │       └── entries/
│   │   │   │           └── page.tsx ✅
│   │   │   ├── participants/
│   │   │   │   └── page.tsx        ✅
│   │   │   ├── control/            🚧 Phase 3
│   │   │   │   └── page.tsx
│   │   │   └── page.tsx            ✅
│   │   ├── new/page.tsx            ✅
│   │   └── page.tsx                ✅
│   ├── layout.tsx                  ✅
│   └── page.tsx                    ✅
├── components/
│   ├── auth/                       ✅
│   ├── courts/                     ✅
│   ├── divisions/                  ✅
│   ├── entries/                    ✅
│   ├── participants/               ✅
│   ├── tournaments/                ✅
│   ├── control-center/             🚧 Phase 3
│   └── ui/ (shadcn)                ✅
├── lib/
│   ├── actions/
│   │   ├── tournaments.ts          ✅
│   │   ├── courts.ts               ✅
│   │   ├── divisions.ts            ✅
│   │   ├── participants.ts         ✅
│   │   ├── entries.ts              ✅
│   │   ├── draws.ts                🚧 Phase 3
│   │   ├── match-assignment.ts     🚧 Phase 3
│   │   └── match-status.ts         🚧 Phase 3
│   ├── services/
│   │   ├── conflict-engine.ts      🚧 Phase 3
│   │   ├── ready-queue.ts          🚧 Phase 3
│   │   └── draw-generators/        🚧 Phase 3
│   ├── supabase/
│   │   ├── client.ts               ✅
│   │   ├── server.ts               ✅
│   │   └── middleware.ts           ✅
│   └── validations/
│       └── tournament.ts           ✅
├── types/
│   └── database.ts                 ✅
├── supabase/
│   ├── migrations/
│   │   ├── 20250101000002_add_prefix.sql         ✅
│   │   ├── 20250101000003_rls_policies_prefixed.sql  ✅
│   │   ├── 20250102000001_add_tournament_id_to_participants.sql  ✅
│   │   └── 20250102000002_phase3_schema.sql      🚧 Phase 3
│   └── README.md                   ✅
├── CLAUDE.md                       ✅ Updated
├── PROGRESS.md                     ✅ This file
├── README.md                       ✅
└── package.json                    ✅
```

---

## 🔧 Technical Stack

### Frontend
- **Framework**: Next.js 15.1.3 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: TanStack Query
- **Forms**: React Hook Form + Zod
- **Real-time**: Supabase Realtime subscriptions

### Backend
- **Database**: PostgreSQL (via Supabase)
- **Auth**: Supabase Auth
- **API**: Next.js Server Actions
- **Validation**: Zod schemas
- **Security**: Row-Level Security (RLS)

### DevOps
- **Version Control**: Git + GitHub
- **Deployment**: Vercel (automatic on push)
- **Auto-sync**: Post-commit hook
- **Migrations**: Supabase migrations

---

## 📝 Recent Commits (Last 10)

1. `9e20868` - Fix: Use Next.js Link component for Manage Entries button
2. `e00cb0c` - Add Phase 2: Entry Management - Assign Participants to Divisions
3. `5c1f7b2` - Fix: Add missing tournament_id to participants table
4. `d7b65c3` - Add Phase 2: Participant Management functionality
5. `ff66e17` - Enhance division management with format-specific configuration
6. `26e665c` - Add Phase 2: Division Management functionality
7. `a1cb848` - Add Phase 2: Court Management functionality
8. `60ed28a` - Fix: Replace <a> tags with Next.js Link components
9. `...` - Earlier commits

---

## 🐛 Known Issues / Tech Debt

### High Priority
- [ ] **BLOCKER**: Must run migration `20250102000001_add_tournament_id_to_participants.sql` in Supabase before participant management works
  - Adds missing `tournament_id` column to participants table
  - Instructions in `supabase/README.md`

### Medium Priority
- [ ] Entry dialog shows TODO comment for multi-division warning (not yet implemented)
- [ ] No bulk import for participants (manual entry only)
- [ ] No entry re-ordering after initial seeding
- [ ] Division edit doesn't check if entries exist (could cause issues if changing draw_size)

### Low Priority
- [ ] No confirmation dialog when deleting division with entries
- [ ] Court names limited to 20 characters (could be more flexible)
- [ ] Timezone input is free-text (should be dropdown of IANA zones)

---

## 🎯 Next Steps

### Immediate (This Week)
1. ✅ Update documentation (CLAUDE.md, PROGRESS.md)
2. [ ] User testing of Phase 2 features in production
3. [ ] Ensure all migrations are run in Supabase
4. [ ] Create test tournament with sample data

### Short-term (Next 1-2 Weeks)
1. [ ] Start Phase 3: Create migration for scheduling tables
2. [ ] Implement Swiss pairing algorithm
3. [ ] Build draw generation service
4. [ ] Create TD Control Center page structure

### Medium-term (Next 3-4 Weeks)
1. [ ] Complete all Phase 3 features
2. [ ] Implement conflict detection
3. [ ] Build auto-assignment algorithm
4. [ ] Add real-time updates
5. [ ] User testing with multi-division tournaments

---

## 📊 Metrics

### Code Stats
- **Total Files**: ~50
- **Components**: 20+
- **Server Actions**: 15+
- **Database Tables**: 13
- **Lines of Code**: ~5,000+

### Performance
- **Build Time**: ~1.5s
- **First Load JS**: 102 kB (shared)
- **Largest Route**: 198 kB (auth pages)

### Deployment
- **Platform**: Vercel
- **Region**: iad1 (US East)
- **Auto-deploy**: On push to main
- **URL**: https://bracket-blaze.vercel.app

---

## 📚 Resources

- **GitHub Repo**: https://github.com/sukrutgametheory/bracket-blaze.git
- **Supabase Dashboard**: https://app.supabase.com/project/YOUR_PROJECT_ID
- **Vercel Dashboard**: https://vercel.com/sukruts-projects-d6e04eae/bracket-blaze
- **PRD**: `racquet_tournament_manager_mvp_prd_canvas.md`
- **Architecture Decisions**: See "Key Architectural Decisions" in CLAUDE.md

---

**Last Updated**: January 2, 2025
**Next Review**: Start of Phase 3 (after Phase 2 user testing)
