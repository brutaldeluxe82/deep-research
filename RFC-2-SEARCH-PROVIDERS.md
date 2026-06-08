# RFC-2: Search Provider Model — Zero-Assumption, Vendorized Adapters

**Status:** Draft · **Date:** 2026-06-07 · **Supersedes:** RFC §4.1 (Adapter Pattern)

---

## 1. Core Principle

> **pi ships with zero search providers.** We make no assumptions about what search tools are installed.

This means:

- `synthetic_web_search` is a separate extension (`pi-synthetic`), not built into pi
- No other search tool is guaranteed to be present
- Our package must work as a self-contained unit — every provider we list is vendorized

The `deep-research` package vendors all its own search adapters. If a user has API keys, adapter code calls the API directly. If they don't, the only fallback is what we ship: DuckDuckGo HTML scraping (fragile, rate-limited) or a prompt to get a free key.

---

## 2. Provider Categories

### 2.1 Vendorized Search Providers (shipped in the package)

These are self-contained Node.js HTTP clients. Zero external dependencies beyond `node:fetch`.

| Provider | Env Key | Type | Quality | Zero-config? |
|----------|---------|------|---------|-------------|
| Brave | `BRAVE_API_KEY` | REST API | ⭐⭐⭐ Best | ❌ Needs key (free tier) |
| Exa | `EXA_API_KEY` | REST API | ⭐⭐⭐ Neural | ❌ Needs key |
| Tavily | `TAVILY_API_KEY` | REST API | ⭐⭐ Agent-optimized | ❌ Needs key |
| DuckDuckGo | *(none)* | HTML scraping | ⭐ Fragile | ✅ Always "available" |

**Key point:** DuckDuckGo is vendorized as a best-effort fallback. It scrapes `html.duckduckgo.com` — this is brittle and rate-limited. It exists so the package doesn't completely fail with zero keys, but it is NOT a reliable production provider.

### 2.2 Dual-Interface Providers (Search + Extraction)

Some vendors are both search providers AND content extractors:

| Provider | Search? | Extract? | Notes |
|----------|---------|----------|-------|
| Exa | ✅ | ✅ | Neural search + clean content extraction |
| Firecrawl | ❌ | ✅ | `/v1/search` exists but is limited. Moved to extraction-only. |
| Native HTTP | — | ✅ | Always available: `node:fetch` + HTML stripping |

### 2.3 External Extensions (NOT vendorized, NOT in our registry)

These are pi extensions the user may or may not have installed. We CANNOT call them from our TypeScript code. We can only suggest the LLM use them as fallback tools.

| Tool | Extension | What it does |
|------|-----------|-------------|
| `synthetic_web_search` | `pi-synthetic` | Zero-data-retention search. Good quality when available. |
| `pi-browse` web search | `pi-browse` | Web browsing with MCP |

**Our tools should reference these as fallback hints** in error messages, not as registry providers.

---

## 3. Error Handling Policy

Since we can't assume any provider is available, error messages must be honest and actionable:

### 3.1 Zero keys, DDG fails

```
No search results found.

Deep research works best with a search API key. To get started (2 minutes):
1. Get a FREE Brave Search API key: https://api.search.brave.com/app/api-keys
2. Add to your shell: export BRAVE_API_KEY=your_key
3. Restart this session

Alternatively, try the synthetic_web_search tool if pi-synthetic is installed.
```

### 3.2 Some keys, but all failed

```
No results found for "query" via brave, exa.

This may be a temporary API issue. Try:
- A different query phrasing
- The synthetic_web_search tool as an alternative
- Check your API keys are valid in ~/.config/pi/deep-research.json
```

### 3.3 Status line

| Situation | Status line |
|-----------|------------|
| Has paid keys | `3 search providers, 2 extractors` |
| Only DDG | `1 search provider (DuckDuckGo only — add API keys for better results)` |
| DDG + 1 paid key | `2 search providers, 1 extractor` |

---

## 4. The Wizard: What It Should Do

The setup wizard runs once on first session. Its job is **not** to configure search — the search chain auto-detects keys. Its job is:

1. **Tell the user what keys were found** (transparency — they might not know `BRAVE_API_KEY` is in their env)
2. **Tell the user what they're missing** with signup URLs (actionable)
3. **Explain the quality tiers** so they understand why free keys matter
4. **Mark itself done** so it doesn't re-trigger

The wizard does NOT ask the user to pick a "preferred provider" — that was a misleading concept because `parallelSearch()` uses all available providers simultaneously anyway.

---

## 5. Provider Implementation Contract

Every vendorized provider must:

| Requirement | Why |
|-------------|-----|
| Use only `node:fetch` (no npm deps for HTTP) | Keep package self-contained |
| Implement `SearchProvider` interface | Registry can compose fallback chains |
| `isAvailable()` must be honest | Returns `true` ONLY if the provider can actually return results right now |
| `search()` must not throw on rate-limits | Return `[]` and let the fallback chain continue |
| Handle DNS failures gracefully | `node:fetch` throws on network errors — catch and return `[]` |
| Set a reasonable timeout (10-15s) | Don't block the parallel fan-out on one slow provider |
| No state between calls | Each `search()` call is independent — no cookies, no sessions |

### The `isAvailable()` honesty rule

A provider returning `isAvailable() === true` but `search() === []` is a **phantom**. It wastes a slot in the parallel fan-out and misleads the user. 

Previous violation: `SyntheticSearchProvider` was `isAvailable()=true` but `search()=[]` because it can't call `synthetic_web_search` from TypeScript. **Removed from the registry.**

### DuckDuckGo exception

DuckDuckGo is `isAvailable()=true` because it CAN return results — it just often doesn't (rate-limited, blocked by DDG). This is acceptable because it sometimes works, vs synthetic which never works from our code.

---

## 6. Open Issues & TODO

| # | Issue | Severity | Proposed Fix |
|---|-------|----------|-------------|
| 1 | **DDG is fragile as the sole zero-config option** | 🟠 | Add a SearXNG client (public instances) or a Brave free-tier with embedded key rotation. Or accept that zero-config is limited. |
| 2 | **Can't call synthetic_web_search from extension code** | 🟡 | This is a pi platform limitation. Workaround: suggest the LLM use it as a fallback tool. Could request a pi API for cross-extension tool calls. |
| 3 | **No re-run wizard** | 🟡 | Add a `/research-setup` command that resets `setupWizardComplete=false`. |
| 4 | **`parallelSearch` hard-caps at top 3 providers** | 🟡 | Use ALL available providers, not just top 3. The fan-out is parallel — more providers don't add latency, just more results. |
| 5 | **No smoke test after install** | 🟡 | Add a `pi-deep-research-doctor` command that checks: API keys detected, providers available, test search works. |
| 6 | **Firecrawl has a `/v1/search` endpoint we're not using** | 🟡 | Re-evaluate. If Firecrawl search quality is decent, add back as low-priority search provider (last in chain). Needs real-world testing. |
| 7 | **No provider health tracking** | 🟡 | Track success rate per provider. If Brave fails 5x in a row, deprioritize it in the chain for this session. |
| 8 | **DDG scraping breaks when DDG changes HTML** | 🟡 | Monitor. Use CSS-selectors-based parser instead of regex for more resilience. Or switch to DDG's lite version. |

---

## 7. Relationship to RFC-1

This document updates and clarifies RFC-1 §4.1 (Adapter Pattern for Search Providers) and §4.2 (ParallelMuse at Tool Level). The adapter pattern is unchanged. What changed:

| RFC-1 said | RFC-2 updates |
|-------------|---------------|
| 6 search adapters listed | 4 search adapters (removed firecrawl-as-search, removed synthetic) |
| Synthetic is "always available inside pi" | Synthetic is a separate extension, NOT available from our code |
| Firecrawl in search fallback chain | Firecrawl is extraction-only |
| `preferredSearchProvider` in wizard | Removed — wizard shows keys detected + signup URLs |
| "Zero-config works with DuckDuckGo + Synthetic" | "Zero-config works with DuckDuckGo (limited). For better results, get a free API key." |
