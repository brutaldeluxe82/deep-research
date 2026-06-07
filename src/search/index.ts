/**
 * Provider index — registers all search providers and extractors into the registry.
 *
 * Adding a new vendor:
 * 1. Create ./providers/<name>.ts implementing SearchProvider and/or ContentExtractor
 * 2. Add the import + registration here
 * 3. Add the name to KNOWN_PROVIDERS in types.ts
 * 4. That's it.
 */

import { registry } from "./registry.ts";
import type { DeepResearchConfig } from "../config.ts";
import { resolveApiKey } from "./types.ts";

// Search providers
import { BraveSearchProvider } from "./providers/brave.ts";
import { ExaSearchProvider, ExaContentExtractor } from "./providers/exa.ts";
import { DuckDuckGoSearchProvider } from "./providers/duckduckgo.ts";
import { TavilySearchProvider } from "./providers/tavily.ts";
import { FirecrawlSearchProvider, FirecrawlContentExtractor } from "./providers/firecrawl.ts";
import { SyntheticSearchProvider } from "./providers/synthetic.ts";

// Content extractors (separate from search, some providers implement both)
import { NativeContentExtractor } from "./providers/native-extract.ts";

/**
 * Register all providers with the global registry.
 * API keys are resolved: config → env var → empty string.
 * Providers with empty keys report isAvailable() = false.
 */
export function registerProviders(config: DeepResearchConfig): void {
	const keys = config.apiKeys as Record<string, string>;

	// --- Search providers ---
	registry.registerSearchProvider(new BraveSearchProvider(resolveApiKey("brave", keys)));
	registry.registerSearchProvider(new ExaSearchProvider(resolveApiKey("exa", keys)));
	registry.registerSearchProvider(new TavilySearchProvider(resolveApiKey("tavily", keys)));
	registry.registerSearchProvider(new FirecrawlSearchProvider(resolveApiKey("firecrawl", keys)));
	registry.registerSearchProvider(new DuckDuckGoSearchProvider());
	registry.registerSearchProvider(new SyntheticSearchProvider());

	// --- Content extractors ---
	registry.registerExtractor(new FirecrawlContentExtractor(resolveApiKey("firecrawl", keys)));
	registry.registerExtractor(new ExaContentExtractor(resolveApiKey("exa", keys)));
	registry.registerExtractor(new NativeContentExtractor());
}
