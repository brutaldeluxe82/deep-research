/**
 * Multi-provider parallel search — the core of deep_search.
 *
 * Fans out queries across all available providers, deduplicates by URL,
 * and tracks provider health to adaptively rank the search order.
 *
 * Each provider runs independently (Promise.allSettled), so one slow
 * or failing provider doesn't block the others.
 */

import type { DeepResearchConfig } from "../config.ts";
import type { SearchResult } from "./types.ts";
import { registry } from "./registry.ts";
import { ProviderHealth } from "./provider-health.ts";

/** Normalize a URL for dedup: strip trailing slash, fragments, sort params. */
function normalizeUrl(url: string): string {
	try {
		const u = new URL(url);
		u.hash = "";
		u.pathname = u.pathname.replace(/\/+$/, "") || "/";
		u.searchParams.sort();
		return u.toString();
	} catch {
		return url;
	}
}

/**
 * Search multiple providers in parallel, deduplicate by URL.
 *
 * @param queries  One or more search queries (fan-out across each provider)
 * @param maxResults  Cap on total unique results returned
 * @param config  Resolved config (fallback chain, etc.)
 * @returns Deduplicated results + which providers contributed
 */
export async function parallelSearch(
	queries: string[],
	maxResults: number = 10,
	config: DeepResearchConfig,
): Promise<{ results: SearchResult[]; providers: string[] }> {
	const chain = config.searchFallbackChain.filter(p => {
		const provider = registry.getSearchProvider(p);
		return provider?.isAvailable();
	});

	// Sort chain by health score — healthy providers first
	const sortedChain = [...chain].sort((a, b) => {
		return ProviderHealth.getHealth(b) - ProviderHealth.getHealth(a);
	});

	// Fan out queries across all available providers
	const allResults = new Map<string, SearchResult>();
	const providersUsed = new Set<string>();

	// Create search tasks: each query × each provider
	const tasks: Promise<void>[] = [];

	for (const query of queries) {
		for (const providerName of sortedChain) {
			tasks.push((async () => {
				try {
					const provider = registry.getSearchProvider(providerName);
					if (!provider?.isAvailable()) return;

					const startTime = Date.now();
					const results = await provider.search(query, { maxResults });
					const elapsed = Date.now() - startTime;

					// Track provider health
					if (results.length > 0) {
						ProviderHealth.recordSuccess(providerName, elapsed);
						providersUsed.add(providerName);
					} else if (elapsed < 2000) {
						// Fast empty response = likely API issue, not timeout
						ProviderHealth.recordFailure(providerName);
					}

					for (const r of results) {
						const key = normalizeUrl(r.url);
						if (!allResults.has(key)) {
							allResults.set(key, { ...r, source: providerName });
						}
					}
				} catch {
					ProviderHealth.recordFailure(providerName);
				}
			})());
		}
	}

	await Promise.allSettled(tasks);

	// Sort by relevance score (if available) then by source quality
	const results = [...allResults.values()]
		.sort((a, b) => {
			if (a.score && b.score) return b.score - a.score;
			if (a.score) return -1;
			if (b.score) return 1;
			return 0;
		})
		.slice(0, maxResults);

	return { results, providers: [...providersUsed] };
}
