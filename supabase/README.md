# Supabase Database Setup

## ⚠️ Important: Using Prefixed Tables

All database tables use the `bracket_blaze_` prefix to:
- Avoid naming conflicts
- Clearly identify Bracket Blaze tables
- Better organize your Supabase project

## Running Migrations

You have two options for running these migrations:

### Option 1: Using Supabase Dashboard (Recommended for Quick Start)

1. Go to your Supabase project dashboard: https://app.supabase.com/project/YOUR_PROJECT_ID
2. Navigate to the SQL Editor
3. Copy and paste the contents of each migration file in order:
   - **Recommended**: `migrations/20250101000002_add_prefix.sql` (with bracket_blaze_ prefix)
   - **Then**: `migrations/20250101000003_rls_policies_prefixed.sql`
4. Run each migration by clicking "Run"

**Note**: The old migrations (20250101000000 and 20250101000001) are kept for reference but use the new prefixed versions above.

### Option 2: Using Supabase CLI (Recommended for Development)

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Push migrations:
   ```bash
   supabase db push
   ```

## Environment Variables

After setting up your database, make sure to create `.env.local` in the project root:

```bash
cp .env.example .env.local
```

Then fill in your Supabase credentials from: https://app.supabase.com/project/YOUR_PROJECT_ID/settings/api

## Database Schema Overview

### Core Tables (all prefixed with `bracket_blaze_`)
- **bracket_blaze_tournaments**: Tournament metadata and configuration
- **bracket_blaze_courts**: Physical courts available for matches
- **bracket_blaze_divisions**: Competition divisions within tournaments
- **bracket_blaze_participants**: Individual players
- **bracket_blaze_teams**: Teams for doubles/group events
- **bracket_blaze_entries**: Participants/teams registered in divisions
- **bracket_blaze_matches**: Individual matches with status and results
- **bracket_blaze_match_events**: Immutable audit log of all scoring actions
- **bracket_blaze_standings**: Materialized standings for Swiss/Groups formats
- **bracket_blaze_checkins**: Player check-in tracking
- **bracket_blaze_official_assignments**: Referees assigned to matches

### Custom Types (all prefixed with `bracket_blaze_`)
- `bracket_blaze_tournament_status`
- `bracket_blaze_entry_status`
- `bracket_blaze_match_status`
- `bracket_blaze_sport_type`
- `bracket_blaze_format_type`

### Key Features
- UUID primary keys throughout
- Row Level Security (RLS) enabled on all tables
- Automatic `updated_at` timestamps
- Comprehensive indexes for performance
- Event sourcing for match scoring
