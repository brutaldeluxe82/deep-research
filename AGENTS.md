# AGENTS.md — pi-deep-research

Guidance for AI agents (and humans) working on this codebase.

---

## Project Overview

A [pi](https://github.com/earendil-works/pi-coding-agent) package called `pi-deep-research` that implements iterative deep research as a pi skill + extension. Inspired by Alibaba's DeepResearch/Odysseus.

**Core techniques:**
- **Multi-provider parallel search** — fan-out across all available providers simultaneously, converge + deduplicate
- **Structured outline generation** — outline-then-write for report structure
- **Goal-directed extraction** — LLM-driven extraction with `{rational, evidence, summary}` evidence threading

**Current version:** 0.3.0 · **License:** MIT · **Repo:** [brutaldeluxe82/pi-deep-research](https://github.com/brutaldeluxe82/pi-deep-research)

---

## Architecture

```
index.ts                          ← Re-exports extensions/index.ts
extensions/
  index.ts                        ← Main extension: registers 5 tools + lifecycle hooks
skills/
  deep-research/SKILL.md         ← LLM-facing skill instructions (YAML frontmatter required)
src/
  config.ts                       ← Config loader: $PI_CODING_AGENT_DIR/deep-research.json
  setup-wizard.ts                 ← First-run wizard: detects API keys, shows signup URLs
  search/
    types.ts                      ← SearchProvider + ContentExtractor interfaces, KNOWN_PROVIDERS
    registry.ts                   ← ProviderRegistry singleton with fallback chains
    index.ts                      ← Wires providers to registry on session_start
    providers/
      brave.ts                    ← Brave Search API (BRAVE_API_KEY)
      exa.ts                      ← Exa neural search + content extraction (EXA_API_KEY)
      tavily.ts                   ← Tavily agent search (TAVILY_API_KEY)
      scholar.ts                  ← Semantic Scholar academic search (FREE, zero-config)
      duckduckgo.ts              ← Zero-config HTML scraping (main + Lite fallback)
      firecrawl.ts               ← Content extraction only (FIRECRAWL_API_KEY)
      native-extract.ts          ← Zero-config: fetch + HTML stripping
  research/
    engine.ts                     ← ResearchEngine, ProviderHealth, SubQuestion/Evidence tracking
    strategies.ts                 ← 5 research strategy templates (comparison, factcheck, deep_dive, exploratory, temporal)
  report/
    html.ts                       ← HTML + Markdown report generator
```

---

## Key Principles

### Zero-Assumption, Vendorized Providers

> **pi ships with zero search providers.** We make no assumptions about what search tools are installed.
- `synthetic_web_search` is a **separate extension** (`pi-synthetic`), NOT callable from our TypeScript code
- We can only **suggest** external tools as fallback hints in error messages
- Every provider we ship is a **vendorized** self-contained Node.js HTTP client using only `node:fetch`
- Adding a new provider: implement `SearchProvider` interface → add to `KNOWN_PROVIDERS` → register in `src/search/index.ts`. That's it.

### Provider Contract

Every provider must:
- Use only `node:fetch` — no npm deps for HTTP
- Implement `SearchProvider` or `ContentExtractor` interface
- Have honest `isAvailable()` — `true` ONLY if it can return results right now (no phantoms)
- **Never throw** from `search()` — catch all errors and return `[]` so the fallback chain continues
- Handle DNS failures gracefully (catch on `fetch`)
- Set a reasonable timeout (10–15s) via `AbortSignal.timeout()`
- No state between calls (no cookies, no sessions)

### Firecrawl is Extraction-Only in the Default Chain

Firecrawl's `/v1/search` endpoint is limited. It's registered as a `ContentExtractor`, not a `SearchProvider`. The `FirecrawlSearchProvider` class exists for manual `engine="firecrawl"` override but is not in the default `searchFallbackChain`.

---

## pi Extension API Patterns

This is a pi package. It uses these pi extension APIs:

### Tool Registration

```typescript
pi.registerTool({
  name: "tool_name",           // snake_case
  label: "Human Label",
  description: "What it does — the LLM reads this",
  parameters: Type.Object({
    query: Type.String({ description: "..." }),
    max_results: Type.Optional(Type.Number({ description: "...", default: 10 })),
  }),  // No `as never` — see Gotcha #6
  async execute(_toolCallId, params) {
    const query = params.query;  // Properly typed — no `as string` cast needed
    return {
      content: [{ type: "text" as const, text: "result" }],
      details: {},
    };
  },
});
```

### Lifecycle Hooks

```typescript
pi.on("session_start", async (_event, ctx) => { /* ... */ });
pi.on("session_shutdown", () => { /* ... */ });
```

### UI Methods

- `ctx.ui.notify(message, "info" | "warning" | "error")` — **NOT `"success"`**, only info/warning/error
- `ctx.ui.setStatus(key, value)` — status bar text
- `ctx.ui.select(title, options)` — interactive picker (we no longer use this in the wizard)

---

## Config

**Path:** `$PI_CODING_AGENT_DIR/deep-research.json`

Resolution order:
1. `PI_CODING_AGENT_DIR` env var (set via mise in `~/.config/mise/conf.d/00-env-secrets.toml`)
2. `XDG_CONFIG_HOME`
3. Default: `~/.pi/agent/`

Config is managed by chezmoi: `~/.local/share/chezmoi/dot_config/private_pi/deep-research.json`

---

## The 5 Tools

| Tool | Purpose | Key Parameters |
|------|---------|---------------|
| `deep_search` | Multi-provider parallel search | `query`, `max_results`, `engine`, `parallel` |
| `deep_extract` | Content extraction + evidence tracking | `url`, `goal`, `claim`, `sub_question_id`, `max_tokens` |
| `research_checkpoint` | Quality gate after each round | `depth`, `round`, `sub_questions_*`, `confidence`, `gaps` |
| `research_outline` | Structured outline generation | `query`, `sub_questions` |
| `research_report` | HTML + Markdown report output | `query`, `depth`, `sources_*` |

---

## Gotchas & Common Mistakes

### 1. Don't add `synthetic` as a registry provider

`synthetic_web_search` runs in `pi-synthetic`, a separate extension. We cannot call it from our TypeScript. If you add `SyntheticSearchProvider` to the registry, it becomes a phantom (`isAvailable()=true` but `search()=[]`), breaking the parallel fan-out.

**Instead:** reference it as a fallback hint in error messages.

### 2. Don't put unimplemented providers in KNOWN_PROVIDERS

`KNOWN_PROVIDERS` is used by the setup wizard to detect available providers. If you add `"serper"` without a provider class, the wizard shows it as available but `searchWithFallback` crashes at runtime.

**Instead:** add commented entries below the array with a note to uncomment after implementing.

### 3. `ctx.ui.notify()` only supports `"info"`, `"warning"`, `"error"`

Using `"success"` throws at runtime.

### 4. Don't cap `parallelSearch` at 3 providers

More providers = more results, zero extra latency (they run in parallel). Previously capped at top 3, which wasted available providers. Now uses all.

### 5. Skill YAML frontmatter is mandatory

```yaml
---
name: deep-research
description: Conduct iterative deep research...
---
```

Without `name` and `description` fields, pi won't load the skill.

### 6. Import TypeBox from `"typebox"`, NOT `"@sinclair/typebox"`

Pi ships its own `typebox` package (v1.x). Import from `"typebox"` to use pi's built-in version — no runtime dependency needed.

```typescript
import { Type } from "typebox";  // ✅ Uses pi's built-in typebox
import { Type } from "@sinclair/typebox";  // ❌ Adds a runtime dependency
```

### 7. `as never` is NOT needed for TypeBox parameters

Previous versions of this project used `}) as never` on parameter schemas, but this is **wrong**. The official pi extension API uses TypeScript generics — `ToolDefinition<TParams>` infers `params` in `execute()` as `Static<TParams>` from TypeBox. When you cast the schema to `never`, you break this inference and get `params: never`, forcing `as string` casts everywhere.

**Correct pattern** (from official pi docs/examples):
```typescript
pi.registerTool({
  name: "my_tool",
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
  }),  // No `as never`!
  async execute(_toolCallId, params) {
    const query = params.query;  // Properly typed as string
  },
});
```

The `as never` pattern was cargo-culted and masks real type errors (like missing `details` on error returns).

The wizard used to ask users to pick a "preferred" provider, but `parallelSearch()` ignores it entirely — it uses the `searchFallbackChain`. The new wizard shows detected keys + signup URLs instead. Don't re-add this.

### 8. Error messages must be actionable

When search fails:
- **Zero keys:** show Brave signup URL + `export BRAVE_API_KEY=your_key`
- **Has keys but failed:** suggest `synthetic_web_search` tool + check config path
- Never just say "No results found" with no next step.

### 9. TypeBox `Type.Optional(Type.String(...))` needs double closing `))`

```typescript
// ✅ Correct
engine: Type.Optional(Type.String({ description: "Override engine" })),
// ❌ Missing closing paren — causes runtime parse error
engine: Type.Optional(Type.String({ description: "Override engine" }),),
```

---

## Adding a New Search Provider

1. Create `src/search/providers/yourprovider.ts` implementing `SearchProvider`:
   ```typescript
   export class YourProvider implements SearchProvider {
     readonly name = "yourprovider";
     readonly label = "Your Provider";
     isAvailable(): boolean { return /* api key present */ }
     async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
       try {
         // ... fetch and parse
         return results;
       } catch { return []; }  // NEVER throw
     }
   }
   ```

2. Add to `KNOWN_PROVIDERS` in `src/search/types.ts` (uncomment or add):
   ```typescript
   export const KNOWN_PROVIDERS = [
     "brave", "exa", "tavily", "duckduckgo",
     "yourprovider",  // ← add here
   ] as const;
   ```

3. Add env key to `ENV_KEY_MAP` in `src/search/types.ts`:
   ```typescript
   const ENV_KEY_MAP: Record<string, string> = {
     brave: "BRAVE_API_KEY",
     yourprovider: "YOUR_API_KEY",  // ← add here
   };
   ```

4. Register in `src/search/index.ts`:
   ```typescript
   import { YourProvider } from "./providers/yourprovider.ts";
   registry.registerSearchProvider(new YourProvider(resolveApiKey("yourprovider", keys)));
   ```

5. Add to search fallback chain in config defaults (`src/config.ts`):
   ```typescript
   searchFallbackChain: ["brave", "exa", "tavily", "yourprovider", "duckduckgo"],
   ```

6. Update the `deep_search` tool `engine` parameter description.

That's it — no other changes needed.

---

## Adding a New Content Extractor

Same pattern: implement `ContentExtractor`, register in `src/search/index.ts`, add to `extractFallbackChain`.

Dual-interface providers (search + extract, like Exa and Firecrawl) are separate classes in the same file.

---

## Testing

There are no automated tests yet. Manual testing:

1. `pi install git:github.com/brutaldeluxe82/pi-deep-research` — installs from git
2. Restart pi session — wizard runs on first login
3. Test with `deep_search("test query")` — should use Brave/Exa/Tavily in parallel
4. Test zero-config by unsetting API keys — should get DDG fallback + actionable error
5. Run diagnostics by checking provider registry manually

---

## Commit Conventions

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation changes
- `refactor:` code restructure without behavior change

---

## Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `BRAVE_API_KEY` | Brave Search | API authentication |
| `EXA_API_KEY` | Exa | API authentication (search + extract) |
| `TAVILY_API_KEY` | Tavily | API authentication |
| `FIRECRAWL_API_KEY` | Firecrawl | API authentication (extract only) |
| `PI_CODING_AGENT_DIR` | Config | Config file directory (set via mise) |
