# Supabase Database Setup

## Running Migrations

You have two options for running these migrations:

### Option 1: Using Supabase Dashboard (Recommended for Quick Start)

1. Go to your Supabase project dashboard: https://app.supabase.com/project/YOUR_PROJECT_ID
2. Navigate to the SQL Editor
3. Copy and paste the contents of each migration file in order:
   - First: `migrations/20250101000000_initial_schema.sql`
   - Second: `migrations/20250101000001_rls_policies.sql`
4. Run each migration by clicking "Run"

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

### Core Tables
- **tournaments**: Tournament metadata and configuration
- **courts**: Physical courts available for matches
- **divisions**: Competition divisions within tournaments
- **participants**: Individual players
- **teams**: Teams for doubles/group events
- **entries**: Participants/teams registered in divisions
- **matches**: Individual matches with status and results
- **match_events**: Immutable audit log of all scoring actions
- **standings**: Materialized standings for Swiss/Groups formats
- **checkins**: Player check-in tracking
- **official_assignments**: Referees assigned to matches

### Key Features
- UUID primary keys throughout
- Row Level Security (RLS) enabled on all tables
- Automatic `updated_at` timestamps
- Comprehensive indexes for performance
- Event sourcing for match scoring
