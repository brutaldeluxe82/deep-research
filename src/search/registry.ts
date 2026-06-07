/**
 * Search Provider Registry
 *
 * In-memory registry that holds all loaded search providers and content extractors.
 * Providers are registered at startup; the fallback chain selects among them at query time.
 */

import type { SearchProvider, ContentExtractor, SearchOptions, SearchResult, ExtractResult } from "./types.ts";

class ProviderRegistry {
	private searchProviders = new Map<string, SearchProvider>();
	private extractors = new Map<string, ContentExtractor>();

	// ── Search providers ─────────────────────────────────────────────────────

	registerSearchProvider(provider: SearchProvider): void {
		this.searchProviders.set(provider.name, provider);
	}

	getSearchProvider(name: string): SearchProvider | undefined {
		return this.searchProviders.get(name);
	}

	listSearchProviders(): SearchProvider[] {
		return [...this.searchProviders.values()];
	}

	listAvailableSearchProviders(): SearchProvider[] {
		return this.listSearchProviders().filter((p) => p.isAvailable());
	}

	/**
	 * Execute a search across the fallback chain.
	 * Tries each provider in order; returns results from the first that succeeds.
	 */
	async searchWithFallback(
		query: string,
		chain: string[],
		opts?: SearchOptions,
	): Promise<{ results: SearchResult[]; provider: string; tried: string[] }> {
		const tried: string[] = [];

		for (const name of chain) {
			const provider = this.searchProviders.get(name);
			if (!provider || !provider.isAvailable()) continue;

			tried.push(name);
			try {
				const results = await provider.search(query, opts);
				if (results.length > 0) {
					return { results, provider: name, tried };
				}
			} catch {
				// Provider failed — try next in chain
			}
		}

		return { results: [], provider: "", tried };
	}

	// ── Content extractors ───────────────────────────────────────────────────

	registerExtractor(extractor: ContentExtractor): void {
		this.extractors.set(extractor.name, extractor);
	}

	getExtractor(name: string): ContentExtractor | undefined {
		return this.extractors.get(name);
	}

	listExtractors(): ContentExtractor[] {
		return [...this.extractors.values()];
	}

	listAvailableExtractors(): ContentExtractor[] {
		return this.listExtractors().filter((e) => e.isAvailable());
	}

	/**
	 * Extract content using a specific extractor, or fall back through the chain.
	 */
	async extractWithFallback(
		url: string,
		chain: string[],
		opts?: { maxTokens?: number; format?: "text" | "markdown" | "html" },
	): Promise<ExtractResult | null> {
		for (const name of chain) {
			const extractor = this.extractors.get(name);
			if (!extractor || !extractor.isAvailable()) continue;

			try {
				const result = await extractor.extract(url, opts);
				if (result.content.length > 0) return result;
			} catch {
				// Extractor failed — try next
			}
		}
		return null;
	}
}

// Singleton registry
export const registry = new ProviderRegistry();
