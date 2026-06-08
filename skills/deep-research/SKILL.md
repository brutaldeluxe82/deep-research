---
name: deep-research
description: Conduct iterative deep research using multi-provider parallel search (ParallelMuse), goal-directed extraction with evidence threading, WebWeaver outline-then-write, confidence-gated checkpoints, and beautiful HTML+Markdown report generation. Use when the user asks to research, investigate, deep dive, or find out about a topic that requires multiple sources and synthesis. Triggers on research X, deep dive into X, investigate X, find out about X, what is the best X, compare X vs Y, or any complex question a single search cannot fully answer.
---

# Deep Research

Conduct structured, iterative deep research using multi-provider parallel search, goal-directed extraction, and confidence-driven iteration. Outputs beautiful HTML + Markdown reports.

**Available tools:**
- `deep_search` — ParallelMuse search across all available providers (Brave / Exa / Tavily / Scholar + DuckDuckGo fallback)
- `deep_extract` — Extract clean content from URLs (Firecrawl → Exa → native HTTP)
- `deep_research` — Start a research run (sets up depth + parameters + strategy)
- `research_checkpoint` — **MANDATORY** quality gate after each search round
- `research_extract` — Goal-directed extraction with {rational, evidence, summary} evidence tracking
- `research_outline` — WebWeaver outline generation before writing
- `research_report` — Generate final HTML + Markdown report with confidence gauge, evidence chains, source badges
- `research_setup` — Check/fix search configuration (API keys, providers)
- `deep_research_doctor` — Run diagnostics (smoke test search, health check providers)
- `research_scholar` — Search academic papers via Semantic Scholar (free, no API key needed)
- `research_code` — Execute JavaScript code in a sandboxed environment (must be enabled in config)
- `research_file` — Extract text content from local files (text, CSV, JSON, PDF, code)

**Search providers** (auto-detected from environment):
- **With API keys:** Brave, Exa, Tavily — used in parallel for maximum coverage
- **Without API keys:** DuckDuckGo only (zero-config, limited quality)
- **Always available:** Semantic Scholar (free academic search — no key needed)
- **Tip:** If no results from `deep_search`, fall back to `synthetic_web_search` tool directly

## Research Strategy Templates

The `deep_research` tool auto-detects a research strategy based on the query type. You can also specify `strategy` explicitly to override auto-detection.

| Strategy | Query Type | Evidence Threshold | Approach |
|----------|-----------|-------------------|----------|
| `comparison` | "X vs Y" | 3 per option | Search each option separately, then direct comparisons |
| `factcheck` | "is X true" | 2 supporting + 2 contradicting | Search claim, debunking, academic sources |
| `deep_dive` | "explain X" | 5 | Overview → technical → edge cases |
| `exploratory` | open-ended | 3 per sub-question | Broad → narrow funnel |
| `temporal` | "latest X" or "history of X" | 2 per time period | Chronological, recency filters |

**Auto-detection rules:**
- `comparison`: Query contains vs, versus, compare, better, best
- `factcheck`: Query asks if something is true/false, mentions myths, debunking
- `deep_dive`: Query starts with "what is", "define", "explain"
- `temporal`: Query mentions latest, recent, history, timeline, or years (2024-2026)
- `exploratory`: Default for all other queries

Example:
```
deep_research(query="React vs Vue performance", strategy="comparison")
deep_research(query="Is AI conscious?", strategy="factcheck")
deep_research(query="latest LLM benchmarks")  // auto-detected as temporal
```

## When to Use

- User says "research X", "deep dive into X", "investigate X", "find out about X"
- Complex questions requiring multiple sources and synthesis
- Fact-checking or multi-perspective analysis
- Any question a single search can't fully answer

## Research Depth & Source Targets

| Depth | Rounds | Target Sources | Queries/Round | Time | When to use |
|-------|--------|----------------|----------------|------|-------------|
| quick | 2 | 15 | 4 | 2min | Focused factual questions |
| standard | 6 | 40 | 5 | 8min | Most research (default) |
| deep | 10 | 60 | 6 | 20min | Complex multi-faceted topics |

**Goal: match or exceed Gemini Deep Research's ~60 source coverage on deep runs.**

## Workflow

### Phase 1 — Understand & Plan

Call `deep_research` to initialize, then decompose the question into **4-8 sub-questions** (more than before — we need broad coverage to hit 40-60 sources).

For each sub-question, identify:
1. What specific data points, facts, or perspectives should we look for?
2. What type of sources would be most credible? (academic, industry, primary, government)
3. What search query variations would surface different angles?

### Phase 2 — Search & Gather (ParallelMuse Iterative Loop)

**The core principle: FAN OUT, not deep dive.** Each round should cast a wide net.

```
┌─→ For EACH sub-question:                                  ─┐
│     Generate 3-5 diverse search queries                     │
│       ↓                                                     │
│     deep_search(query, parallel=true, max_results=10)       │
│     → Fans out across ALL providers simultaneously          │
│     → Deduplicates by URL                                   │
│     → Returns merged results with provider tags              │
│       ↓                                                     │
│   For top 6-10 results:                                     │
│     research_extract(url, goal="...", claim="...")          │
│     → Goal-directed extraction                              │
│     → Track evidence: claim → evidence → source             │
│     → Note {rational, evidence, summary} for each finding   │
│       ↓                                                     │
│   Self-reflect: what's still missing?                       │
│       ↓                                                     │
│   research_checkpoint(                                     ─┘
│     depth, round, sub_questions answered,
│     total_sources, confidence, gaps
│   )
│       ↓
│   Read the VERDICT:
│     🔴 CONTINUE → next round, new queries
│     🟢 PROCEED  → Phase 3
└── If CONTINUE, loop back
```

**Critical rules:**

1. **Call `research_checkpoint` after EVERY search round — no exceptions**
2. **Do NOT write the report without a 🟢 PROCEED verdict**
3. **Be honest about confidence** — 1 weak source = 20-30%, not 70%
4. **Aim for the source target** — keep going until you have 15/40/60 sources

**Search strategy — the ParallelMuse approach:**

- `deep_search` with `parallel=true` fans out across ALL available providers simultaneously
- This is how we hit high source counts: 3 providers × 5 queries × 10 results = 150 raw → ~40-60 unique after dedup
- Each round, use different query phrasings for the same sub-question
- Round 1: Broad queries covering all sub-questions
- Round 2: Targeted queries for gaps, + "latest 2026", "analysis", "comparison"
- Round 3+: Niche queries for stubborn gaps, try different providers

**Query diversity recipes:**
- Direct: `"AI coding benchmarks 2026"`
- Rephrased: `"how do code generation models compare in 2026"`
- Specific: `"SWE-bench Verified leaderboard June 2026"`
- Comparative: `"Claude vs GPT vs Gemini coding agent 2026"`
- Academic: `"arxiv autonomous software engineering agent architecture 2026"`
- Evidence-seeking: `"what is the best approach to building AI coding agents"`

**Extraction strategy — the goal-directed pattern:**

Use `research_extract` (not raw `deep_extract`) for structured research:
- Pass the `goal` parameter: what specific information you're seeking
- Pass the `claim` parameter: what claim this evidence will support
- After reading, note: **rational** (why relevant), **evidence** (specific fact), **summary** (one sentence)
- This creates the evidence chain for the report

**Confidence scoring:**
- 1 source, weak credibility → 20-30%
- 1 source, strong credibility → 40-50%
- 2 sources agree → 60-70%
- 3+ sources converge → 85-95%
- Sources contradict → cap at 50% until resolved

### Phase 3 — WebWeaver: Outline, Then Write

**Only enter this phase after receiving a 🟢 PROCEED verdict.**

1. Call `research_outline` with:
   - Title, sub-questions, key findings, contradictions
   - This generates a structured outline mapping sections → sub-questions → sources

2. Write each section according to the outline, following these writing principles:

**Writing principles — this is where quality lives:**

1. **Synthesize, don't summarize.** "X is true because A, B, C converge" — not "Source A says X."
2. **Build evidence chains.** Every major claim → supporting evidence → source.
3. **Construct a coherent narrative.** Each sub-question should connect to the others.
4. **Analyze, don't report.** Compare, contrast, evaluate — don't just list what sources say.
5. **Contradictions are valuable.** Actively look for them, don't dismiss them.
6. **Cite every claim** with inline `[Source](url)` — no unsourced assertions.

3. Call `research_report` to generate the final output:
   - Pass all structured data: title, sections, sources, contradictions, confidence
   - This generates BOTH an HTML file (with dark/light mode, confidence gauge, etc.) AND a Markdown file
   - Returns file paths for both

**HTML report features:**
- 🎨 Dark/light mode (follows system preference)
- 📊 Confidence gauge ring
- 📑 Interactive table of contents
- 🏷️ Source credibility badges (Tier 1/2/3)
- 🔗 Evidence chain callouts
- 📂 Collapsible detail sections
- 🖨️ Print-friendly layout
- 📱 Responsive/mobile-friendly

### Phase 4 — Deliver

After generating the report:
1. Mention both the `.html` and `.md` file paths
2. Suggest the user open the HTML file in a browser for the full interactive experience
3. **STOP.** The user decides next steps.

## Quick Reference

```
deep_research(query="...", depth="standard")     → Initialize + plan
deep_search(query="...", parallel=true, max_results=10)  → ParallelMuse search
#     compress=true (default) → compress each provider branch, then synthesize (saves 10-30% tokens)
#     compress=false → return raw merged results (full detail)
research_extract(url="...", goal="...", claim="...")      → Goal-directed extraction
research_checkpoint(depth, round, ..., confidence, gaps)  → Quality gate
research_outline(title, sub_questions, key_findings)      → WebWeaver outline
research_report(title, sections, sources, confidence)     → HTML + MD output
```
