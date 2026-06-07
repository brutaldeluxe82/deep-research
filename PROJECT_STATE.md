# deep-research — Project State

**Package:** `deep-research` v0.2.0 · **Status:** Active Development · **Repo:** [github.com/brutaldeluxe82/deep-research](https://github.com/brutaldeluxe82/deep-research)

---

## What Is This?

A self-contained pi (coding agent) package that implements iterative deep research — multi-round search across multiple providers, goal-directed content extraction with evidence chaining, and structured report generation in HTML + Markdown.

*Think of it as a local-first, privacy-respecting alternative to Gemini Deep Research that lives inside your coding agent and uses whatever LLM you have configured.*

## Inspirations

| # | Source | What We Took | Citation |
|---|--------|-------------|----------|
| 1 | **Alibaba DeepResearch** (2025) | ParallelMuse convergence (multi-path search), goal-directed extraction `{rational, evidence, summary}`, WebWeaver outline-then-write, quality filtering, LLM-driven stop decision | [GitHub: Alibaba-NLP/DeepResearch](https://github.com/Alibaba-NLP/DeepResearch) |
| 2 | **Odysseus** (DeepResearch sub-agent orchestrator) | The IterResearch pattern: plan → search → extract → synthesize → decide → loop. We simplified from 14 sub-agents to a tool-driven loop. | [GitHub: Alibaba-NLP/DeepResearch](https://github.com/Alibaba-NLP/DeepResearch) |
| 3 | **OpenDev** (arXiv:2603.05344, March 2026) | Adapter pattern for search providers, registry architecture with auto-discovery, dual-interface providers (search + extraction), lazy availability detection | [arxiv.org/abs/2603.05344](https://arxiv.org/abs/2603.05344) |
| 4 | **Claude Code** reverse-engineering study (arXiv:2604.14228, April 2026) | Progressive compaction metaphor for research convergence, summary-only subagent returns, deny-first patterns for checkpoints, evidence threading | [arxiv.org/abs/2604.14228](https://arxiv.org/abs/2604.14228) |
| 5 | **pi-browse** v1.0.13 | Extension/skill package structure, zero-config fallback concept | npm: pi-browse |
| 6 | **Gemini Deep Research** | 60-source target for deep research, query diversity recipes, structured report format | Google DeepMind |

## Design Choices

### ✅ Chosen

| Choice | Rationale |
|--------|-----------|
| **Adapter pattern for providers** | Each vendor has fundamentally different API formats. Adapter pattern isolates differences; new vendors added in 3 steps. |
| **ParallelMuse at tool level** | `Promise.allSettled()` fan-out, not sub-agents. Results need to merge into one context for dedup — sub-agent isolation works against this. |
| **Evidence threading with types** | `Evidence { claim, rational, confidence, source }` linked to `SubQuestion { id, status, evidence[] }`. Forces structured evidence capture → dramatically better reports. Free-text evidence gets lost across long sessions. |
| **HTML + Markdown dual output** | HTML for interactive reading (dark/light, TOC, badges, collapsible). Markdown for text workflows. Both generated from same data. |
| **60-source deep target** | Source count correlates with report breadth. Without explicit targets, LLMs stop at 3-5 sources and claim "sufficient". |
| **Config at PI_CODING_AGENT_DIR** | Follows pi's convention, not XDG app-specific. Lives alongside other pi config. |
| **7 tools, not 1 monolithic tool** | Each tool has a single responsibility: search, extract, checkpoint, etc. The LLM compositional tool use handles the workflow. |
| **Confidence-gated checkpoints** | 🔴 CONTINUE / 🟢 PROCEED with source progress bar, explicit next-action guidance. Prevents premature report writing. |

### ❌ Rejected

| Choice | Why Rejected |
|--------|-------------|
| **Full 14-agent architecture (Alibaba)** | Too heavy. Requires Hermes LLM dependency. The iterative loop pattern captures 80% of the value with 5% of the complexity. |
| **Single HTTP client with URL templates** | Can't handle fundamentally different request/response formats (Brave: `web.results`, Exa: `results`, DDG: HTML parse). |
| **PDF generation** | Requires Puppeteer/Playwright. Self-contained HTML provides the same reading experience with zero dependencies. |
| **LLM-driven extraction quality filter** | Would require model-specific prompting. Current approach relies on credibility tiers and honest confidence scoring. |
| **pi-browse dependency** | User wanted self-contained adapters, not a wrapper around pi-browse. Avoids circular deps. |

## Architecture Map

```
┌──────────────────────────────────────────────────────────┐
│                    deep-research                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  extensions/index.ts  ← 7 pi tools registered            │
│  ├── deep_search       (ParallelMuse)                    │
│  ├── deep_extract      (content extraction)               │
│  ├── deep_research     (pipeline init + plan)             │
│  ├── research_checkpoint (quality gate)                   │
│  ├── research_extract  (goal-directed + evidence)         │
│  ├── research_outline  (WebWeaver)                        │
│  └── research_report  (HTML + Markdown output)           │
│                                                          │
│  src/research/engine.ts ← research state machine          │
│  ├── SubQuestion tracking (open/partial/answered)         │
│  ├── Evidence threading (claim→evidence→source)            │
│  ├── Contradiction tracking                              │
│  ├── Confidence calculation                              │
│  └── parallelSearch() with URL dedup                     │
│                                                          │
│  src/report/html.ts ← self-contained HTML template        │
│  ├── Dark/light mode (CSS variables)                     │
│  ├── Confidence gauge ring                               │
│  ├── Interactive TOC                                     │
│  ├── Source credibility badges (tier-1/2/3)              │
│  └── Evidence callouts + contradiction blocks            │
│                                                          │
│  src/search/ ← adapter pattern                           │
│  ├── types.ts       (SearchProvider, ContentExtractor)   │
│  ├── registry.ts    (singleton with fallback chains)      │
│  ├── index.ts       (provider registration wiring)        │
│  └── providers/                                          │
│      ├── brave.ts          (BRAVE_API_KEY)               │
│      ├── exa.ts            (EXA_API_KEY)                 │
│      ├── tavily.ts         (TAVILY_API_KEY)              │
│      ├── firecrawl.ts       (FIRECRAWL_API_KEY)           │
│      ├── duckduckgo.ts      (zero-config)                 │
│      ├── synthetic.ts       (pi built-in)                │
│      └── native-extract.ts  (zero-config HTTP)           │
│                                                          │
│  src/config.ts ← PI_CODING_AGENT_DIR resolution           │
│  src/setup-wizard.ts ← first-run provider picker          │
│                                                          │
│  skills/deep-research/SKILL.md ← 3-phase workflow docs   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Implementation Status

### ✅ Shipped (v0.2.0)

- [x] Core search adapter pattern with 6 providers + native extraction
- [x] ParallelMuse multi-provider parallel search with URL dedup
- [x] Goal-directed extraction `{rational, evidence, summary}`
- [x] Research engine: SubQuestion + Evidence + Contradiction types
- [x] WebWeaver outline generation
- [x] HTML report: dark/light mode, confidence gauge, badges, TOC, contradictions
- [x] Confidence-gated checkpoints with source progress bar
- [x] Config respecting PI_CODING_AGENT_DIR + XDG fallback
- [x] First-run setup wizard
- [x] SKILL.md with full 3-phase workflow
- [x] RFC.md documenting decisions
- [x] GitHub repo: brutaldeluxe82/deep-research
- [x] Config checked into chezmoi

### 🔄 In Progress

- [ ] Publish to npm for `pi install deep-research` (not just local path)
- [ ] Test Exa + Firecrawl + DuckDuckGo in parallel (only Brave tested in practice)

### 📋 Planned

- [ ] Serper, Google, Gemini search provider implementations
- [ ] Prompt templates: extract-prompt.md, converge-prompt.md, report-template.md
- [ ] Automated test suite
- [ ] LLM-driven extraction quality filter (inspired by DeepResearch `is_low_quality()`)
- [ ] Auto-open HTML report in browser after generation
- [ ] Session resume: persist research state across pi sessions
- [ ] Parallel extraction: extract from N URLs simultaneously
- [ ] Incremental reports: update existing report with new findings

## Test History

| Date | Query | Depth | Sources | Confidence | Notes |
|------|-------|-------|---------|------------|-------|
| 2026-06-06 | Best 2026 retro games | quick | 2 | 🟢 | First test, basic flow works |
| 2026-06-06 | AI coding agents 2026 | standard | 4 | 72%→85% | 2 rounds, checkpoint gating works |
| 2026-06-07 | AI code gen benchmarks + agent architectures | standard | 58 | 82% | ParallelMuse with Brave, full HTML report generated |

## Key Metrics Reference

| Depth | Rounds | Target Sources | Queries/Round | Extracts/Round | Time |
|-------|--------|----------------|----------------|-----------------|------|
| quick | 2 | 15 | 4 | 6 | 2min |
| standard | 6 | 40 | 5 | 8 | 8min |
| deep | 10 | 60 | 6 | 10 | 20min |

---

*Last updated: 2026-06-07 · See [RFC.md](./RFC.md) for detailed design rationale and [README.md](./README.md) for usage.*
