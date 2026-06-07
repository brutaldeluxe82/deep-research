# RFC: deep-research — Iterative Deep Research for Pi

**Status:** Draft · **Version:** 0.2.0 · **Date:** 2026-06-07 · **Author:** Olly Ainger

---

## 1. Problem Statement

Pi lacks a native deep research capability. Individual search tools exist (`synthetic_web_search`) but provide only single-query, single-provider results. There is no orchestration for:

- Multi-round iterative search with confidence-gated convergence
- Parallel search across multiple providers for source coverage
- Goal-directed content extraction with evidence threading
- Structured report generation (HTML + Markdown)

Users researching complex topics must manually manage search, extraction, and synthesis — repeating queries, tracking sources by hand, and writing reports from scattered notes.

## 2. Proposed Solution

A self-contained pi package called `deep-research` that implements iterative deep research as a pi skill + extension with 7 registered tools. The package follows the IterResearch pattern (plan → search → extract → synthesize → decide → loop) with three advanced techniques adapted from academic literature.

## 3. Inspirations & References

### 3.1 Alibaba DeepResearch / Odysseus (Rank 1 — Core Pattern)

**Source:** [Alibaba DeepResearch](https://github.com/Alibaba-NLP/DeepResearch) — 14 sub-agents for autonomous web research.

**What we took:**
- **Goal-directed extraction with `{rational, evidence, summary}`** — The WebThinker agent extracts content guided by a research goal, then produces structured evidence: *rational* (why relevant), *evidence* (specific data point), *summary* (one-sentence distillation). We implement this as `research_extract`.
- **LLM-driven stop decision** — The Concluder agent evaluates whether enough evidence has been gathered. We implement this as `research_checkpoint` with confidence scoring and source coverage thresholds.
- **Quality filtering with `is_low_quality()`** — The Evaluator agent rejects low-quality sources. We implement credibility tiers (tier-1/2/3) with auto-assessment based on URL heuristics.

**What we didn't take:**
- The full 14-agent architecture — too heavy for a pi extension. We use the iterative loop pattern instead of spawning separate agents.
- The Hermes LLM dependency — our package is model-agnostic, works with whatever LLM pi is configured to use.

**Citation:** Alibaba NLP Team, "DeepResearch: Agentic Deep Research System," 2025. GitHub: Alibaba-NLP/DeepResearch.

### 3.2 ParallelMuse Convergence (Rank 2 — Multi-Path Search)

**Source:** Alibaba DeepResearch's ParallelMuse agent — searches multiple paths simultaneously and merges the best results.

**What we took:**
- **Fan-out across all available search providers simultaneously** — `deep_search` with `parallel=true` dispatches queries to Brave, Exa, Tavily, Firecrawl, DuckDuckGo, and Synthetic in parallel.
- **Deduplication by normalized URL** — Results are deduplicated using a URL normalization pipeline (strip tracking params, remove trailing slashes, lowercase host).
- **Convergence scoring** — When multiple providers return the same source, that source is ranked higher.

**Design choice:** We implement ParallelMuse at the tool level, not as a separate agent. The `research_engine.ts` handles the fan-out via `Promise.allSettled()`, making it both simpler and more reliable than inter-agent coordination.

**Citation:** Alibaba NLP Team, "DeepResearch: ParallelMuse Agent," 2025.

### 3.3 WebWeaver — Outline-Then-Write (Rank 3 — Structured Reporting)

**Source:** Alibaba DeepResearch's WebWeaver agent — generates an outline first, then expands each section independently.

**What we took:**
- **Outline generation** mapping sections → sub-questions → sources. Implemented as `research_outline`.
- **Section-by-section writing** — After the outline is generated, each section is written independently using only its assigned sources and sub-question context. This prevents context bloat and produces more focused, coherent sections.
- **Contradiction tracking** — The outline highlights contradictions between sources, ensuring the report actively surfaces disagreement rather than glossing over it.

**Design choice:** Rather than a separate "write each section" agent, we provide the outline and let the pi LLM (which is already managing the research) write sections sequentially. This avoids the overhead of spawning sub-agents for each section.

**Citation:** Alibaba NLP Team, "DeepResearch: WebWeaver Agent," 2025.

### 3.4 OpenDev — Compound AI System Architecture

**Source:** Bui, N.D.Q., "Building AI Coding Agents for the Terminal: Scaffolding, Harness, Context Engineering," arXiv:2603.05344, March 2026.

**What we took:**
- **Adapter pattern for search providers** — Following OpenDev's registry-based tool architecture, each search provider implements a `SearchProvider` interface with `name`, `label`, `isAvailable()`, and `search()`. Adding a new vendor requires only implementing the interface and registering.
- **Dual-interface providers** — Some vendors (Exa, Firecrawl) are both `SearchProvider` AND `ContentExtractor`. The registry handles both interfaces independently.
- **Lazy availability detection** — Providers report availability based on API key presence, allowing the fallback chain to auto-select among available options.

**Citation:** Bui, N.D.Q., "Building Effective AI Coding Agents for the Terminal," arXiv:2603.05344, March 2026.

### 3.5 Claude Code — Context Engineering Patterns

**Source:** Liu et al., "Dive into Claude Code: The Design Space of Today's and Future AI Agent Systems," arXiv:2604.14228, April 2026.

**What we took:**
- **Progressive compaction metaphor** — The 5-layer compaction pipeline (budget → snip → microcompact → collapse → auto-compact) inspired our confidence degradation approach: checkpoints become more lenient as rounds accumulate, allowing the research to converge naturally.
- **Summary-only subagent returns** — Our evidence tracking returns only `{rational, evidence, summary}` rather than full extracted content, mirroring how Claude Code's subagents return summaries to parents.
- **Deny-first with graduated trust** — Our research_checkpoint defaults to 🔴 CONTINUE (explicit continue-or-stop), requiring positive evidence to proceed rather than stopping by default.

**Citation:** Liu, J., Zhao, X., Shang, X., Shen, Z., "Dive into Claude Code: The Design Space of Today's and Future AI Agent Systems," arXiv:2604.14228, April 2026.

### 3.6 pi-browse — Foundation Package

**Source:** `pi-browse` v1.0.13 on npm — existing pi package for web browsing.

**What we took:**
- The extension/skill package structure and pi manifest format.
- The concept of zero-config fallback providers (DuckDuckGo always works).

**What we didn't take:**
- We don't depend on pi-browse. Our search providers are self-contained adapters, not wrappers around pi-browse. This avoids circular dependencies and lets the package work independently.

## 4. Design Choices

### 4.1 Adapter Pattern for Search Providers

**Decision:** Each search vendor implements a common `SearchProvider` interface. New vendors can be added in 3 steps (implement interface, add to `KNOWN_PROVIDERS`, add env key to `ENV_KEY_MAP`).

**Rationale:** The search API landscape changes rapidly. Brave's API format differs entirely from Exa's. DuckDuckGo needs no key at all. An adapter pattern isolates these differences and lets the registry compose fallback chains based on runtime availability.

**Alternative considered:** A single HTTP client with provider-specific URL templates. Rejected because it cannot handle fundamentally different request/response formats (Brave returns `web.results`, Exa returns `results` with different fields, DuckDuckGo returns HTML to parse).

### 4.2 ParallelMuse at Tool Level, Not Agent Level

**Decision:** Parallel search is implemented as `Promise.allSettled()` in the research engine, not by spawning sub-agents per provider.

**Rationale:** Pi sub-agents operate in separate context windows, which is the right isolation boundary for code execution. For search fan-out, however, we need the results merged back into the same context for deduplication and ranking. Tool-level parallelism achieves this without context-splitting overhead.

**Alternative considered:** Spawn one sub-agent per search provider, have each return results, merge in the parent. Rejected because the inter-agent communication overhead would exceed the search latency, and sub-agents can't share the deduplication map.

### 4.3 Evidence Threading with Structured Types

**Decision:** Evidence is tracked with explicit types: `Evidence { claim, rational, confidence, source, extractedAt }`, linked to `SubQuestion { id, question, status, evidence[] }`.

**Rationale:** The Alibaba DeepResearch `{rational, evidence, summary}` pattern showed that forcing structured evidence capture dramatically improves report quality. Without it, the LLM tends to "summarize summaries" rather than building evidence chains. The types also enable the HTML report generator to render evidence callouts with source links.

**Alternative considered:** Free-text evidence tracking in the LLM's context. Rejected because it's unreliable across long research sessions — the LLM forgets which evidence supports which claim.

### 4.4 HTML Report as First-Class Output

**Decision:** Generate self-contained HTML reports alongside Markdown, with dark/light mode, confidence gauge, evidence chains, and source credibility badges.

**Rationale:** Markdown is the standard for text workflows, but research reports benefit enormously from HTML features: interactive table of contents, collapsible sections, color-coded credibility badges, and responsive layout. The HTML file opens in any browser with zero dependencies. This matches how users actually consume research reports (in a browser, not a terminal).

**Alternative considered:** PDF generation via a headless browser. Rejected because it requires additional dependencies (Puppeteer/Playwright), and self-contained HTML provides the same reading experience with simpler tooling.

### 4.5 60-Source Target for Deep Research

**Decision:** Deep research targets 60 sources (matching Gemini Deep Research), standard targets 40, quick targets 15.

**Rationale:** Source count directly correlates with report breadth and confidence. Gemini Deep Research's ~60-source coverage produces significantly more comprehensive reports than single-digit source counts. The ParallelMuse fan-out (3 providers × 6 queries × 10 results per query = 180 raw results → ~60 unique after dedup) makes this achievable.

**Alternative considered:** Unlimited source collection with threshold-based stopping. Rejected because without explicit targets, the LLM tends to stop too early (3-5 sources feel "enough" to the model). Explicit targets push the research to be genuinely thorough.

### 4.6 Config at `$PI_CODING_AGENT_DIR/deep-research.json`

**Decision:** Config file lives at the pi config directory (respecting `PI_CODING_AGENT_DIR`, XDG fallback, default `~/.pi/agent/`).

**Rationale:** This follows pi's own convention. The user already has `PI_CODING_AGENT_DIR=~/.config/pi` set via mise secrets, so the config lands at `~/.config/pi/deep-research.json` — consistent with all other pi config.

**Alternative considered:** `~/.config/deep-research/config.json` (XDG app-specific). Rejected because deep-research is a pi package, not a standalone application. It should live alongside other pi config.

## 5. Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Core search adapter pattern | ✅ Done | 6 providers + native extraction |
| ParallelMuse search | ✅ Done | Multi-provider fan-out with dedup |
| Goal-directed extraction | ✅ Done | `{rational, evidence, summary}` pattern |
| Research engine + evidence tracking | ✅ Done | SubQuestion + Evidence + Contradiction types |
| WebWeaver outline generation | ✅ Done | `research_outline` tool |
| HTML report generation | ✅ Done | Dark/light, confidence gauge, badges, TOC |
| Confidence-gated checkpoints | ✅ Done | Source progress bar, next-action guidance |
| Config with PI_CODING_AGENT_DIR | ✅ Done | Respects env vars + XDG fallback |
| Setup wizard | ✅ Done | First-run provider picker |
| SKILL.md with full workflow | ✅ Done | 3-phase with advanced features documented |
| 60-source deep research | ✅ Done | Tested with 58 sources on Brave |
| Package on npm | ❌ Not yet | Currently `pi install /tmp/deep-research-pkg` |
| Exa/Firecrawl parallel test | ❌ Not yet | Only Brave tested in practice |
| Serper/Google/Gemini providers | ❌ Not yet | ENV_KEY_MAP supports them, no implementations |
| Prompt templates | ❌ Not yet | extract-prompt.md, converge-prompt.md, report-template.md |
| Automated tests | ❌ Not yet | No test suite |

## 6. Open Questions

1. **Should we publish to npm?** Currently installed from local path. Publishing as `pi-deep-research` or `@brutaldeluxe82/pi-deep-research` would simplify installation.
2. **Should the HTML report be opened automatically?** Currently the file is written and the path is returned. Auto-opening in the browser would be a better UX.
3. **Should we add LLM-driven extraction quality scoring?** The current evidence tracking relies on the LLM to honestly assess confidence. An automated quality filter (inspired by DeepResearch's `is_low_quality()`) could reject irrelevant extractions automatically.
4. **Should we implement the remaining 3 search providers?** Serper, Google, and Gemini have env key mappings but no implementations. Demand-driven: add when users ask for them.

## 7. Changelog

### v0.2.0 (2026-06-07)
- Added ParallelMuse multi-provider parallel search
- Added goal-directed extraction with evidence threading
- Added WebWeaver outline-then-write report structure
- Added HTML report output (dark/light mode, confidence gauge, source badges)
- Added source credibility auto-assessment (tier-1/2/3)
- Added contradiction tracking and display
- Increased source targets (quick: 15, standard: 40, deep: 60)
- Added `research_extract`, `research_outline`, `research_report` tools
- Updated SKILL.md with 3-phase workflow and advanced feature documentation

### v0.1.0 (2026-06-06)
- Initial release
- 4 tools: deep_search, deep_extract, deep_research, research_checkpoint
- 6 search providers (Brave, Exa, Tavily, Firecrawl, DuckDuckGo, Synthetic)
- 3 content extractors (Firecrawl, Exa, native HTTP)
- Config with PI_CODING_AGENT_DIR support
- First-run setup wizard
