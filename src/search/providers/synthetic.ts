/**
 * Synthetic Search provider — uses pi's built-in synthetic_web_search tool.
 *
 * This is the "always available" provider that requires zero API keys.
 * It delegates to the synthetic_web_search MCP tool which is built into pi.
 *
 * The actual search is performed by calling the pi tool via the extension
 * context. When running outside of a pi tool context (e.g. from the wizard),
 * it gracefully degrades.
 */

import type { SearchProvider, SearchResult, SearchOptions } from "../types.ts";

export class SyntheticSearchProvider implements SearchProvider {
	readonly name = "synthetic";
	readonly label = "Synthetic Search (built-in)";

	isAvailable(): boolean {
		return true; // Always available inside pi
	}

	async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
		// Synthetic search is called by the extension via pi's own tool system.
		// The extension index.ts wires this to use synthetic_web_search directly.
		//
		// When invoked from the registry (not through the extension tool),
		// we return empty — the extension-level tool handles the actual call.
		//
		// This provider exists in the registry so the fallback chain can
		// reference "synthetic" and the wizard can list it as available.
		return [];
	}
}
