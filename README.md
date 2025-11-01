# Bracket Blaze - Tournament Management System

Professional tournament management platform for racquet sports (badminton, squash, pickleball, padel).

🔗 **Production**: https://bracket-blaze.vercel.app (after deployment)
📦 **Repository**: https://github.com/sukrutgametheory/bracket-blaze

## Project Status

**Phase 1: Foundation Complete ✅**

The project foundation has been successfully set up with:
- ✅ Next.js 14+ with TypeScript, App Router, and Tailwind CSS
- ✅ Supabase integration (auth, database, realtime)
- ✅ shadcn/ui component library
- ✅ TanStack Query for state management
- ✅ Database schema with `bracket_blaze_` prefix
- ✅ Comprehensive RLS policies
- ✅ Basic authentication flow
- ✅ Tournament list page
- ✅ Vercel deployment ready
- ✅ Auto-sync to GitHub

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

#### Option A: Use Existing Supabase Project

1. Copy the environment variables template:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your Supabase credentials in `.env.local`:
   - Get these from: https://app.supabase.com/project/YOUR_PROJECT_ID/settings/api

3. Run the database migrations (with `bracket_blaze_` prefix):
   - Open Supabase SQL Editor
   - Run `supabase/migrations/20250101000002_add_prefix.sql`
   - Then run `supabase/migrations/20250101000003_rls_policies_prefixed.sql`

#### Option B: Use Supabase CLI (Recommended for Development)

```bash
# Install Supabase CLI
npm install -g supabase

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

See `supabase/README.md` for detailed instructions.

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Tech Stack

### Frontend
- **Next.js 15.1+** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - High-quality React components

### Backend & Database
- **Supabase** - PostgreSQL database, authentication, and realtime
- **Supabase RLS** - Row-Level Security policies
- **Edge Functions** - Serverless functions for heavy computations

### State Management
- **TanStack Query** - Server state management with realtime updates
- **Zod** - Schema validation
- **React Hook Form** - Form management

## Project Structure

```
/app                      # Next.js App Router pages
  /auth                   # Authentication pages (login, signup)
  /tournaments            # Tournament management pages
  layout.tsx             # Root layout with providers
  page.tsx               # Home page

/components
  /auth                   # Auth-related components
  /tournaments            # Tournament-specific components
  /providers              # Context providers (Query, etc.)
  /ui                     # shadcn/ui components

/lib
  /supabase              # Supabase client utilities
  /validations           # Zod schemas
  utils.ts               # Utility functions

/types
  database.ts            # TypeScript types for database

/supabase
  /migrations            # SQL migration files
  README.md              # Database setup instructions
```

## Features (MVP Scope)

### Phase 1: Foundation ✅
- [x] Project setup with Next.js, TypeScript, Tailwind
- [x] Supabase integration
- [x] Authentication flow
- [x] Basic tournament list

### Phase 2: Tournament Setup (Next)
- [ ] Tournament creation wizard
- [ ] Court management
- [ ] Division setup
- [ ] Participant/entry management
- [ ] Seeding with drag-to-reorder

### Phase 3: Match Scheduling
- [ ] TD Control Center with ready queue
- [ ] Drag-and-drop court assignment
- [ ] Conflict detection engine
- [ ] Rest period guardrails (warning-only)
- [ ] Match status management

### Phase 4: Referee Scoring
- [ ] Scoring engine architecture (badminton, squash, pickleball, padel)
- [ ] Referee mobile app
- [ ] Real-time score updates
- [ ] Match event audit log

### Phase 5: Court TV & Player Portal
- [ ] Court TV display with live scores
- [ ] Player portal with "My Matches"
- [ ] Live draws and brackets
- [ ] Results timeline

## Database Schema

See `supabase/migrations/` for the complete schema. Key tables:

- **tournaments** - Tournament metadata
- **courts** - Physical courts
- **divisions** - Competition divisions
- **participants** - Players
- **entries** - Division registrations
- **matches** - Match records
- **match_events** - Scoring event log (immutable)
- **standings** - Materialized standings

## Environment Variables

Required environment variables (see `.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Development Commands

```bash
# Run development server with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint

# Sync to GitHub (manual)
./sync-to-github.sh
```

## GitHub Sync

This project is configured to automatically sync to GitHub:

🔗 **Repository**: https://github.com/sukrutgametheory/bracket-blaze

### Automatic Sync
A git post-commit hook automatically pushes every commit to GitHub. No manual action needed!

### Manual Sync
If you need to manually sync changes:
```bash
./sync-to-github.sh
```

This script will:
1. Check for uncommitted changes
2. Optionally commit them
3. Push to GitHub
4. Show sync status

## Deployment to Vercel

### Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sukrutgametheory/bracket-blaze)

### Manual Deployment

For detailed deployment instructions, see **[VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)**

**Quick steps:**
1. Connect GitHub repo to Vercel
2. Add environment variables (Supabase credentials)
3. Deploy
4. Configure Supabase redirect URLs

**Result**: Automatic deployments on every push to `main`!

### Production Checklist

Before going live:
- [ ] Run Supabase migrations (prefixed tables)
- [ ] Add environment variables in Vercel
- [ ] Configure Supabase redirect URLs
- [ ] Test authentication flow
- [ ] Verify tournament creation works

## Next Steps

1. **Add your Supabase credentials** to `.env.local`
2. **Run database migrations** (see `supabase/README.md`)
3. **Deploy to Vercel** (see `VERCEL_DEPLOYMENT.md`)
4. **Create a tournament** by signing up and navigating to `/tournaments`
5. **Begin Phase 2** implementation (Tournament Setup Wizard)

## Contributing

This is a private project. For questions or issues, contact the development team.

## License

Proprietary - All rights reserved
