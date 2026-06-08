/**
 * Brave Search API provider.
 * Docs: https://api.search.brave.com/app/documentation/web-search
 *
 * Env: BRAVE_API_KEY
 * Config: apiKeys.brave
 *
 * Contract (RFC-2 §5):
 * - Uses only node:fetch (no external deps)
 * - isAvailable() is honest: true only if API key is present
 * - search() catches all errors and returns [] (never throws)
 * - Handles DNS failures, rate limits, and timeouts gracefully
 * - Timeout: 12s
 */

import type { SearchProvider, SearchResult, SearchOptions } from "../types.ts";

export class BraveSearchProvider implements SearchProvider {
	readonly name = "brave";
	readonly label = "Brave Search";
	private readonly apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = (apiKey ?? "").trim();
	}

	isAvailable(): boolean {
		return this.apiKey.length > 0;
	}

	async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
		try {
			const url = new URL("https://api.search.brave.com/res/v1/web/search");
			url.searchParams.set("q", query);
			url.searchParams.set("count", String(opts?.maxResults ?? 5));

			if (opts?.recency && opts.recency !== "all") {
				url.searchParams.set("freshness", opts.recency);
			}

			const resp = await fetch(url.toString(), {
				headers: {
					"Accept": "application/json",
					"Accept-Encoding": "gzip",
					"X-Subscription-Token": this.apiKey,
				},
				signal: AbortSignal.timeout(12000),
			});

			if (!resp.ok) {
				// Don't throw — let the fallback chain continue
				return [];
			}

			const data = await resp.json() as any;
			const results: SearchResult[] = [];

			for (const item of (data.web?.results ?? [])) {
				results.push({
					title: item.title ?? "",
					url: item.url ?? "",
					snippet: item.description ?? "",
					date: item.age ?? undefined,
					source: item.family_name ?? undefined,
					score: item.relevance_score ?? undefined,
				});
			}

			return results;
		} catch {
			// DNS failure, timeout, network error — return empty, let fallback chain continue
			return [];
		}
	}
}
