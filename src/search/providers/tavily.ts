/**
 * Tavily Search API provider.
 * Docs: https://docs.tavily.com/documentation/api-reference/endpoint/search
 *
 * Env: TAVILY_API_KEY
 * Config: apiKeys.tavily
 *
 * Tavily is purpose-built for AI agents — returns clean, relevant results
 * with optional raw content extraction built in.
 *
 * 
 * - Uses only node:fetch (no external deps)
 * - isAvailable() is honest: true only if API key is present
 * - search() catches all errors and returns [] (never throws)
 * - Timeout: 15s
 */

import type { SearchProvider, SearchResult, SearchOptions } from "../types.ts";

export class TavilySearchProvider implements SearchProvider {
	readonly name = "tavily";
	readonly label = "Tavily Search";
	private readonly apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = (apiKey ?? "").trim();
	}

	isAvailable(): boolean {
		return this.apiKey.length > 0;
	}

	async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
		try {
			const body: Record<string, any> = {
				api_key: this.apiKey,
				query,
				max_results: opts?.maxResults ?? 5,
				search_depth: "basic",
				include_answer: false,
			};

			if (opts?.includeDomains?.length) body.include_domains = opts.includeDomains;
			if (opts?.excludeDomains?.length) body.exclude_domains = opts.excludeDomains;

			const resp = await fetch("https://api.tavily.com/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(15000),
			});

			if (!resp.ok) return [];

			const data = await resp.json() as any;
			const results: SearchResult[] = [];

			for (const item of (data.results ?? [])) {
				results.push({
					title: item.title ?? "",
					url: item.url ?? "",
					snippet: item.content ?? item.snippet ?? "",
					score: item.score ?? undefined,
				});
			}

			return results;
		} catch {
			return [];
		}
	}
}
