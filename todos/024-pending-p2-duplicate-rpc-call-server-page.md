---
status: complete
priority: p2
issue_id: "024"
tags: [code-review, performance, typescript, registration]
dependencies: []
---

# Duplicate RPC Call in Registration Server Page

## Problem Statement

`app/register/[tournamentId]/page.tsx` calls `bracket_blaze_registration_lookup` twice — once in `generateMetadata` for the page title and once in the default export for page data. This results in two identical database queries per page load. The established codebase pattern uses React `cache()` to deduplicate server-side fetches.

## Findings

- `app/register/[tournamentId]/page.tsx` — Both `generateMetadata` (line ~12) and `RegisterPage` (line ~25) call the same RPC
- Next.js App Router does not automatically deduplicate `supabase.rpc()` calls (only `fetch()` is deduped)
- Existing pattern in codebase: use `import { cache } from "react"` to wrap data fetching functions
- Each call creates a new Supabase server client and executes the RPC

## Proposed Solutions

### Option A: Use React cache() wrapper (Recommended)

```typescript
import { cache } from "react"

const getRegistrationData = cache(async (tournamentId: string) => {
  const supabase = await createClient()
  return supabase.rpc("bracket_blaze_registration_lookup", {
    p_tournament_id: tournamentId,
  })
})
```

Then call `getRegistrationData(tournamentId)` in both `generateMetadata` and the page component.

- **Pros:** Follows React/Next.js best practice, eliminates duplicate query, clean pattern
- **Cons:** None
- **Effort:** Small (10 min)
- **Risk:** None

## Acceptance Criteria

- [ ] Registration page makes only one RPC call per request
- [ ] `generateMetadata` and page component share cached data
- [ ] Page still renders correctly with tournament info

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-28 | Created from PR #4 code review | Identified by TypeScript and Performance agents |

## Resources

- PR: https://github.com/sukrutgametheory/bracket-blaze/pull/4
- File: `app/register/[tournamentId]/page.tsx`
