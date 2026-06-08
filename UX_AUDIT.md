# UX Audit: pi-deep-research from a New User's Perspective

**Date:** 2026-06-07 · **Reviewer:** Self-audit · **Severity scale:** 🔴 Critical · 🟠 Major · 🟡 Minor

---

## The New User Journey

### Step 1: Install
```
pi install git:github.com/brutaldeluxe82/pi-deep-research
```
✅ This works fine. Clones, npm installs, no issues.

### Step 2: First pi session after install
The `session_start` handler fires. Two things happen:

1. **Setup wizard** — if `setupWizardComplete` is false
2. **Status line** — shows "X search providers, Y extractors"

### Step 3: The Setup Wizard (🟠 Major issues)

**What the user sees:** A `ctx.ui.select()` prompt listing available providers + "Auto (Recommended)".

**Problems:**

| # | Issue | Severity | Detail |
|---|-------|----------|--------|
| 1 | **Wizard doesn't explain what providers DO** | 🟠 | A user who doesn't know Brave from Exa from Tavily gets one-line descriptions. No guidance on which is "best" for research. |
| 2 | **`preferredSearchProvider` is unused** | 🔴 | The user picks a "preferred" provider, but `parallelSearch()` ignores it entirely — it uses `searchFallbackChain`. The preference is written to config and never read by any search code. |
| 3 | **No API key visibility** | 🟠 | The wizard silently detects keys but doesn't tell the user "I found BRAVE_API_KEY in your environment". The user doesn't know what they already have access to. |
| 4 | **Phantom providers** | 🔴 | Serper, Google, and Gemini appear in `PROVIDER_INFO` and `KNOWN_PROVIDERS` but have **zero implementations**. If a user's env has `SERPER_API_KEY`, the wizard shows Serper as available, but searching with it will crash ("provider not found in registry"). |
| 5 | **No re-run mechanism** | 🟡 | After the wizard completes, `setupWizardComplete=true` is written. To change providers, user must manually edit JSON. No `/research-setup` command. |
| 6 | **"Auto" doesn't explain the user's specific chain** | 🟡 | The description says "tries each in order" but lists the generic chain, not filtered to what's actually available for this user. |

### Step 4: Actually Searching (🔴 Critical issue)

**Zero-API-key user (the most common case!):**

1. `deep_search("some query", parallel=true)` triggers `parallelSearch()`
2. Filters chain to available: `["synthetic", "duckduckgo"]`
3. Takes top 3: `["synthetic", "duckduckgo"]`
4. Fan-out: **synthetic returns `[]` every time** — it's a stub that exists only so the wizard can list it
5. DuckDuckGo scrapes `html.duckduckgo.com`
6. If DDG fails or rate-limits: **user gets zero results**

**The fundamental problem:** `SyntheticSearchProvider` claims `isAvailable() === true` but `search() === []`. It's a phantom — listed as available, counted in the status line, included in the parallel fan-out, but produces nothing. The actual `synthetic_web_search` tool built into pi is never called by the registry's `search()` path.

**Status line says "2 search providers" but only 1 actually works.**

### Step 5: With API Keys (works, but suboptimal)

User with `BRAVE_API_KEY` + `EXA_API_KEY` + `FIRECRAWL_API_KEY`:

1. `parallelSearch` takes top 3 available: `[brave, exa, tavily]` (tavily skipped, no key → `[brave, exa, ??]`)
2. Actually: `[brave, exa, firecrawl]` since firecrawl has a key
3. **Issue:** Firecrawl's `/v1/search` endpoint is limited compared to Brave/Exa. It's primarily an extractor, not a search engine. Using it as the #3 search provider wastes a parallel slot.
4. **Issue:** The `top 3` hard-cap means if a user has all 4 key-based providers (Brave, Exa, Tavily, Firecrawl), only 3 are used. The 4th is ignored.

### Step 6: Error Messages

When search fails completely:
```
No results found for "X". Tried: synthetic, duckduckgo
```

**No actionable guidance.** A new user doesn't know:
- That synthetic is a stub
- That DDG is rate-limited
- That they need an API key
- How to get an API key
- Where to configure it

---

## Summary of Issues

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | **Synthetic provider is a phantom** — `isAvailable()=true` but `search()=[]` | 🔴 | Make synthetic actually call pi's `synthetic_web_search` via tool system, or stop listing it as a search provider |
| 2 | **Zero-API-key UX is broken** — DDG scraping is the only real provider, unreliable | 🔴 | Add SearXNG as a zero-config provider, or make synthetic actually work |
| 3 | **Phantom providers** — Serper/Google/Gemini listed but not implemented | 🔴 | Remove from `KNOWN_PROVIDERS` and `PROVIDER_INFO` until implemented |
| 4 | **`preferredSearchProvider` is unused** | 🔴 | Either wire it into the search flow or remove the wizard choice |
| 5 | **Wizard doesn't show detected keys** | 🟠 | Show "✅ BRAVE_API_KEY found" etc. in the wizard |
| 6 | **Firecrawl as search provider** — limited search, wastes parallel slot | 🟠 | Move firecrawl to extraction-only in the default fallback chain |
| 7 | **Hard-cap top 3 providers** — ignores remaining available providers | 🟡 | Use top 3 for the initial fan-out, then fall back to remaining |
| 8 | **No re-run wizard command** | 🟡 | Add a `/research-setup` command |
| 9 | **Error messages not actionable** | 🟡 | "No results. To fix: set BRAVE_API_KEY (free at https://...)" or similar |
| 10 | **Status line counts phantoms** | 🟡 | Count only providers where `search()` actually returns results |

---

## Recommended Fix Priority

1. **🔴 Fix synthetic provider** — make it actually work or remove it from the search provider list
2. **🔴 Remove phantom providers** — delete Serper/Google/Gemini from KNOWN_PROVIDERS until implemented
3. **🔴 Fix the zero-key experience** — ensure at least one reliable provider works with no configuration
4. **🔴 Remove or wire `preferredSearchProvider`** — don't ask users to pick something that's ignored
5. **🟠 Show detected keys in wizard** — transparency builds trust
6. **🟠 Fix firecrawl chain position** — extraction, not search
7. **🟡 Make errors actionable** — guide users to fix problems
