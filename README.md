# deep-research

Iterative deep research for pi — ParallelMuse multi-provider search, goal-directed extraction, WebWeaver reports, HTML + Markdown output.

## Features

### 🔍 ParallelMuse Search
Fan out queries across ALL available search providers simultaneously. Results are deduplicated and merged — dramatically higher source coverage than single-provider search.

**6 search adapters** with auto-fallback:
| Provider | API Key | Type |
|----------|---------|------|
| Brave | `BRAVE_API_KEY` | Web search |
| Exa | `EXA_API_KEY` | Neural search + content extraction |
| Tavily | `TAVILY_API_KEY` | Agent-optimized search |
| Firecrawl | `FIRECRAWL_API_KEY` | JS-rendered extraction |
| DuckDuckGo | (none) | Zero-config scraping |
| Synthetic | (built-in) | pi's native search |

### 🎯 Goal-Directed Extraction
Extract content from URLs with a **research goal** — track evidence chains from claim → evidence → source. Models the Alibaba DeepResearch `{rational, evidence, summary}` pattern.

### 📝 WebWeaver Reports
Outline-then-write structured report generation. Create an outline mapping sections to sub-questions, then write each section independently for coherent, evidence-backed reports.

### 📊 HTML Report Output
Beautiful, self-contained HTML reports with:
- 🎨 Dark/light mode (follows system preference)
- 📊 Confidence gauge ring
- 📑 Interactive table of contents
- 🏷️ Source credibility badges (Tier 1/2/3)
- 🔗 Evidence chain callouts
- ⚠️ Contradiction tracking
- 📂 Collapsible detail sections
- 🖨️ Print-friendly layout
- 📱 Responsive/mobile-friendly

### 📈 60+ Source Coverage
Deep research targets 60 sources (matching Gemini Deep Research), using multi-query, multi-provider parallel search with source deduplication and cross-referencing.

## Tools

| Tool | Description |
|------|-------------|
| `deep_search` | ParallelMuse search across multiple providers |
| `deep_extract` | Content extraction from URLs |
| `deep_research` | Initialize research pipeline with plan |
| `research_checkpoint` | Quality gate between rounds (mandatory) |
| `research_extract` | Goal-directed extraction with evidence tracking |
| `research_outline` | WebWeaver outline generation |
| `research_report` | Generate final HTML + Markdown report |

## Research Depths

| Depth | Rounds | Target Sources | Time |
|-------|--------|----------------|------|
| quick | 2 | 15 | 2min |
| standard | 6 | 40 | 8min |
| deep | 10 | 60 | 20min |

## Installation

```bash
pi install deep-research
```

## Configuration

Config file: `$PI_CODING_AGENT_DIR/deep-research.json`

Default: `~/.config/pi/deep-research.json` (respects `PI_CODING_AGENT_DIR` and XDG fallback)

API keys are auto-detected from environment variables. Zero-config works with DuckDuckGo + Synthetic search.

### First-Run Wizard

On first use, an interactive wizard helps you pick your preferred search provider.

## Usage

Just ask pi to research something:

```
Research the best approaches to building AI coding agents in 2026
```

The skill will automatically trigger and guide the research workflow using the tools above.

## Architecture

```
src/
├── config.ts           # Config loader with PI_CODING_AGENT_DIR support
├── setup-wizard.ts     # First-run provider picker
├── research/
│   └── engine.ts       # Research engine (ParallelMuse, evidence tracking, WebWeaver)
├── report/
│   └── html.ts         # HTML report generator with dark/light mode
└── search/
    ├── types.ts        # SearchProvider + ContentExtractor interfaces
    ├── registry.ts     # Provider registry with fallback chains
    ├── index.ts        # Provider registration wiring
    └── providers/
        ├── brave.ts    # Brave Search API
        ├── exa.ts      # Exa neural search + extraction
        ├── tavily.ts   # Tavily agent-optimized search
        ├── firecrawl.ts # Firecrawl JS-rendered extraction
        ├── duckduckgo.ts # DuckDuckGo zero-config scraping
        ├── synthetic.ts  # pi built-in synthetic_web_search
        └── native-extract.ts # Native HTTP + HTML stripping
```

## Adding a New Search Provider

1. Create a file in `src/search/providers/` implementing `SearchProvider`
2. Add the provider name to `KNOWN_PROVIDERS` in `types.ts`
3. Add the env var key to `ENV_KEY_MAP`
4. That's it — the registry auto-discovers it

## License

MIT
