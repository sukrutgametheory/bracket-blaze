---
status: pending
priority: p3
issue_id: "019"
tags: [code-review, data-integrity]
dependencies: []
---

# Missing E.164 CHECK Constraint on Players Phone Column

## Problem Statement

The `bracket_blaze_players.phone` column has a UNIQUE constraint but no CHECK constraint enforcing E.164 format. While TypeScript validates via Zod, the database itself accepts any text value. Defense-in-depth would add a database-level format check.

## Findings

- `supabase/migrations/20250106000001_create_players_table.sql` line 7: `phone TEXT NOT NULL` with UNIQUE index but no CHECK
- The `normalizePhone()` function can produce non-E.164 values for edge-case inputs (e.g., "123" → "+123")
- All 125 current player phones pass E.164 validation (verified)

## Proposed Solutions

### Option A: Add CHECK constraint via new migration
```sql
ALTER TABLE bracket_blaze_players
ADD CONSTRAINT chk_phone_e164 CHECK (phone ~ '^\+[1-9]\d{6,14}$');
```
- **Effort**: Small
- **Risk**: Low (all existing data already passes)

## Acceptance Criteria
- [ ] CHECK constraint prevents non-E.164 phones from being inserted
- [ ] Existing data not affected (all 125 records pass the regex)
