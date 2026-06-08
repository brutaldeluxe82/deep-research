---
name: deep-research
description: Conduct iterative deep research using multi-provider parallel search, goal-directed extraction, confidence-gated checkpoints, and HTML+Markdown report generation. Use when the user asks to research, investigate, deep dive, or find out about a topic that requires multiple sources and synthesis. Triggers on research X, deep dive into X, investigate X, find out about X, what is the best X, compare X vs Y, or any complex question a single search cannot fully answer.
---

# Deep Research

Conduct structured, iterative deep research using multi-provider parallel search, goal-directed extraction, and confidence-driven iteration. Outputs HTML + Markdown reports.

**5 tools:**
- `deep_search` — Parallel search across all available providers (Brave / Exa / Tavily + DuckDuckGo fallback)
- `deep_extract` — Extract content from URLs, with optional evidence tracking (pass `goal`/`claim` params)
- `research_checkpoint` — **MANDATORY** quality gate after each search round
- `research_outline` — Structured outline generation before writing
- `research_report` — Generate final HTML + Markdown report with confidence gauge, source badges

**Search providers** (auto-detected from environment):
- **With API keys:** Brave, Exa, Tavily — used in parallel for maximum coverage
- **Without API keys:** DuckDuckGo only (zero-config, limited quality)
- **Tip:** If no results from `deep_search`, fall back to `synthetic_web_search` tool directly

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

## Workflow

### Phase 1 — Understand & Plan

Decompose the question into **4-8 sub-questions.** For each sub-question, identify:
1. What specific data points, facts, or perspectives should we look for?
2. What type of sources would be most credible? (academic, industry, primary, government)
3. What search query variations would surface different angles?

### Phase 2 — Search & Gather (Iterative Loop)

**The core principle: cast a wide net each round.**

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
│     deep_extract(url, goal="...", claim="...")              │
│     → Extracts content from URL                             │
│     → Tracks evidence: claim → evidence → source            │
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

**Search strategy:**

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

**Extraction strategy:**

Use `deep_extract` with the optional `goal` and `claim` params for structured research:
- Pass `goal`: what specific information you're seeking from this page
- Pass `claim`: what claim this evidence will support
- After reading, note: **rational** (why relevant), **evidence** (specific fact), **summary** (one sentence)
- This creates the evidence chain for the report

**Confidence scoring:**
- 1 source, weak credibility → 20-30%
- 1 source, strong credibility → 40-50%
- 2 sources agree → 60-70%
- 3+ sources converge → 85-95%
- Sources contradict → cap at 50% until resolved

### Phase 3 — Outline, Then Write

**Only enter this phase after receiving a 🟢 PROCEED verdict.**

1. Call `research_outline` with:
   - Title, sub-questions, key findings, contradictions
   - Generates a structured outline mapping sections → sub-questions → sources

2. Write each section according to the outline, following these writing principles:

**Writing principles:**

1. **Synthesize, don't summarize.** "X is true because A, B, C converge" — not "Source A says X."
2. **Build evidence chains.** Every major claim → supporting evidence → source.
3. **Construct a coherent narrative.** Each sub-question should connect to the others.
4. **Analyze, don't report.** Compare, contrast, evaluate — don't just list what sources say.
5. **Contradictions are valuable.** Actively look for them, don't dismiss them.
6. **Cite every claim** with inline `[Source](url)` — no unsourced assertions.

3. Call `research_report` to generate the final output:
   - Pass all structured data: title, sections, sources, contradictions, confidence
   - Generates BOTH an HTML file and a Markdown file
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
deep_search(query="...", parallel=true, max_results=10)     → Multi-provider search
deep_extract(url="...", goal="...", claim="...")            → Extract + evidence tracking
research_checkpoint(depth, round, ..., confidence, gaps)    → Quality gate
research_outline(title, sub_questions, key_findings)        → Structured outline
research_report(title, sections, sources, confidence)        → HTML + MD output
```
