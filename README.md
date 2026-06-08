# deep-research

Iterative deep research for pi — multi-provider parallel search, goal-directed extraction, structured reports with HTML + Markdown output.

## Features

### 🔍 Multi-Provider Parallel Search
Fan out queries across ALL available search providers simultaneously. Results are deduplicated by URL — dramatically higher source coverage than single-provider search.

**5 search adapters** with auto-fallback:
| Provider | API Key | Type |
|----------|---------|------|
| Brave | `BRAVE_API_KEY` | Web search |
| Exa | `EXA_API_KEY` | Neural search + content extraction |
| Tavily | `TAVILY_API_KEY` | Agent-optimized search |
| Firecrawl | `FIRECRAWL_API_KEY` | JS-rendered extraction |
| DuckDuckGo | (none) | Zero-config scraping |

### 🎯 Goal-Directed Extraction
Extract content from URLs with an optional **research goal** — track evidence chains from claim → evidence → source. Pass `goal` and `claim` params to `deep_extract`.

### 📝 Structured Reports
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
Deep research targets 60 sources, using multi-query, multi-provider parallel search with URL deduplication.

## Tools

| Tool | Description |
|------|-------------|
| `deep_search` | Parallel search across multiple providers |
| `deep_extract` | Content extraction from URLs (with optional evidence tracking) |
| `research_checkpoint` | Quality gate between rounds (mandatory) |
| `research_outline` | Structured outline generation |
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

API keys are auto-detected from environment variables. Zero-config works with DuckDuckGo fallback.

### First-Run Wizard

On first use, an interactive wizard shows detected API keys and signup URLs.

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
│   ├── engine.ts       # Research engine (parallel search, evidence tracking, outlines)
│   ├── strategies.ts   # Research strategy templates
│   └── strategies.ts  # Research strategy templates
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
        ├── scholar.ts  # Semantic Scholar academic search (free)
        ├── firecrawl.ts # Firecrawl JS-rendered extraction
        ├── duckduckgo.ts # DuckDuckGo zero-config scraping
        └── native-extract.ts # Native HTTP + HTML stripping
```

## Adding a New Search Provider

1. Create a file in `src/search/providers/` implementing `SearchProvider`
2. Add the provider name to `KNOWN_PROVIDERS` in `types.ts`
3. Add the env var key to `ENV_KEY_MAP`
4. That's it — the registry auto-discovers it

## License

MIT
