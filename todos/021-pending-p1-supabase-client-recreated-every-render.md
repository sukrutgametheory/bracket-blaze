---
status: complete
priority: p1
issue_id: "021"
tags: [code-review, performance, typescript, registration]
dependencies: []
---

# Supabase Client Recreated on Every Render in Registration Form

## Problem Statement

In `components/register/registration-form.tsx` line 54, the Supabase client is created directly in the component body: `const supabase = createClient(supabaseUrl, supabaseAnonKey)`. This runs on every render, creating a new GoTrue/Realtime client instance each time. This causes unnecessary object allocation, potential auth state loss, and violates the established pattern used by scoring, live portal, and court TV components.

## Findings

- `components/register/registration-form.tsx:54` — `const supabase = createClient(supabaseUrl, supabaseAnonKey)` runs on every render
- Identified independently by 4 review agents: Security Sentinel, TypeScript Reviewer, Performance Oracle, Architecture Strategist
- Existing codebase pattern uses `useState` initializer: `const [supabase] = useState(() => createClient(url, key))`
- Examples: `components/scoring/scoring-client.tsx`, `components/live/live-portal-client.tsx`, `components/tv/court-tv-client.tsx`

## Proposed Solutions

### Option A: useState initializer (Recommended)

Change line 54 to:
```typescript
const [supabase] = useState(() => createClient(supabaseUrl, supabaseAnonKey))
```

- **Pros:** Follows established codebase pattern, stable reference across renders, one-line fix
- **Cons:** None
- **Effort:** Small (< 5 min)
- **Risk:** None

## Acceptance Criteria

- [ ] Supabase client is created once via `useState` initializer
- [ ] Pattern matches scoring/live/TV components
- [ ] Phone lookup and registration still work correctly

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-28 | Created from PR #4 code review | Found by 4 independent agents |

## Resources

- PR: https://github.com/sukrutgametheory/bracket-blaze/pull/4
- File: `components/register/registration-form.tsx:54`
