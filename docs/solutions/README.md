# Solutions Directory

**Storage for architectural decisions, performance analyses, and implementation guides.**

---

## 📋 Contents

### 2026-02-22-n1-query-performance-analysis.md
**Comprehensive analysis of N+1 query bottlenecks in the codebase.**

- Identifies the critical N+1 bottleneck in `checkConflicts()` (50+ queries per assignment)
- Provides detailed solution with `batchResolveEntryParticipantIds()` implementation
- Covers batch update patterns (upsert, .in() filtering)
- Lists other sequential update patterns needing optimization
- Prioritizes fixes by impact and effort
- Includes testing strategy

**Key metrics:**
- Current: ~500+ queries per tournament
- Optimized: ~100 queries per tournament
- Savings: 80% reduction

**Implementation priority:**
1. checkConflicts() batch resolution (CRITICAL)
2. Bye match completion batching (HIGH)
3. Seed update batching (MEDIUM)
4. Next match reference batching (MEDIUM)

---

### QUERY-PATTERNS-REFERENCE.md
**Quick lookup guide for Supabase query patterns.**

- ✅ Good patterns (with examples and file locations)
- ❌ Bad patterns (with how to fix them)
- 🎯 Decision tree for when to batch
- 🔧 How to convert loops to batch operations
- 📊 Query cost comparison table
- 🚫 Supabase API limitations and workarounds
- 🔍 How to spot N+1 in code

**Covers:**
- Eager loading relationships
- Batch reads with .in()
- Batch inserts and upserts
- Relationship filtering
- Sequential vs. batched costs

---

## 🎯 Quick Start

### For developers fixing N+1 queries:
1. Read the **Decision Tree** in `QUERY-PATTERNS-REFERENCE.md`
2. Reference the **good/bad patterns** section
3. Check the priority order in the analysis document
4. Copy the `batchResolveEntryParticipantIds()` implementation

### For code reviewers:
1. Use **How to Spot N+1** section to identify issues
2. Reference pattern changes from **Converting Loops** section
3. Check cost comparison for impact estimation

### For new queries:
1. Start with the **Decision Tree**
2. Check **QUERY-PATTERNS-REFERENCE.md** for your use case
3. Apply the good patterns from examples

---

## 📁 Related Files in Codebase

### Action files with examples:
- `lib/actions/entries.ts` — batch inserts, .in() filtering
- `lib/actions/court-assignments.ts` — eager loading, relationship filtering
- `lib/actions/draws.ts` — needs optimization (sequential loops)
- `lib/actions/matches.ts` — good patterns in revalidation

### Service files with examples:
- `lib/services/standings-engine.ts` — upsert pattern
- `lib/services/draw-generators/swiss-engine.ts` — algorithmic code

### Files needing optimization:
1. **lib/actions/court-assignments.ts** (line 98-120, 143-174) — CRITICAL
2. **lib/actions/draws.ts** (line 96-101) — seed updates
3. **lib/actions/draws.ts** (line 145-153) — bye matches
4. **lib/actions/draws.ts** (line 483-490) — next_match_id refs

---

## 🔗 Related Documentation

- **Security review:** `docs/2026-02-22-codebase-review-findings.md`
- **Architecture decisions:** Root `CLAUDE.md` file
- **Development phases:** `PROGRESS.md`

---

## 📈 Impact By Optimization

| Fix | Queries Reduced | Tournaments Affected | Priority |
|-----|-----------------|-------------------|----------|
| checkConflicts() batching | 40 per assignment | All with 2+ divisions | CRITICAL |
| Bye match batching | 10-100 per round | Tournaments with byes | HIGH |
| Seed batching | 5-50 per draw gen | All on first generation | MEDIUM |
| Next match refs batching | 50-100 per knockout | Tournaments with knockouts | MEDIUM |
| **Total savings** | **80% fewer queries** | **All tournaments** | **HIGH** |

---

## 🚀 Implementation Roadmap

**Phase 1 (This Sprint):**
- [ ] Create `batchResolveEntryParticipantIds()` utility
- [ ] Refactor `checkConflicts()` to use batch resolution
- [ ] Add unit tests for batch resolution
- [ ] Benchmark before/after

**Phase 2 (Next Sprint):**
- [ ] Batch bye match completion
- [ ] Batch seed updates
- [ ] Batch next_match_id updates
- [ ] Integration tests

**Phase 3 (Future):**
- [ ] Monitor real-world performance
- [ ] Consider Edge Function for complex pairing logic
- [ ] Document performance learnings

---

## 💡 Key Takeaways

1. **Supabase has no native batch-read API** — use `.in()` + map pattern
2. **Eager loading solves 70% of N+1 issues** — fetch relationships in initial query
3. **Upsert is your friend** — use for batch insert/update operations
4. **Avoid loops with await** — fetch everything first, then process
5. **Map pattern enables in-memory joins** — pre-build lookup maps before loops

---

## 🔧 Common Patterns to Remember

**For batch reads:**
```typescript
const { data } = await supabase
  .from("table")
  .select()
  .in("id", ids)  // Not a loop!
```

**For batch updates:**
```typescript
const updates = records.map(r => ({ id: r.id, field: r.value }))
await supabase
  .from("table")
  .upsert(updates, { onConflict: 'id' })
```

**For eager loading:**
```typescript
const { data } = await supabase
  .from("matches")
  .select(`
    *,
    entries!side_a_entry_id(participant_id),
    entries!side_b_entry_id(participant_id)
  `)
```

**For relationship filtering:**
```typescript
const { data } = await supabase
  .from("team_members")
  .select(`*, team:teams!inner(division_id)`)
  .eq("team.division_id", divisionId)
```

---

## 📚 External Resources

- [Supabase Query Documentation](https://supabase.com/docs/reference/javascript/select)
- [PostgREST API Documentation](https://postgrest.org/en/stable/api.html)
- [N+1 Query Problem](https://stackoverflow.com/questions/97197/what-is-the-n1-selects-problem-in-orm-orm-object-relational-mapping)

