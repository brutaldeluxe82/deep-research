/**
 * DuckDuckGo Search provider — no API key required.
 * Uses the DuckDuckGo HTML instant-answer API.
 *
 * This is the zero-config fallback that always works.
 * Quality is lower than Brave/Exa but it needs zero setup.
 */

import type { SearchProvider, SearchResult, SearchOptions } from "../types.ts";

export class DuckDuckGoSearchProvider implements SearchProvider {
	readonly name = "duckduckgo";
	readonly label = "DuckDuckGo";

	isAvailable(): boolean {
		return true; // No API key needed
	}

	async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
		const url = new URL("https://html.duckduckgo.com/html/");
		url.searchParams.set("q", query);

		const resp = await fetch(url.toString(), {
			headers: {
				"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
				"Accept": "text/html",
			},
			signal: AbortSignal.timeout(10000),
		});

		if (!resp.ok) {
			throw new Error(`DuckDuckGo returned ${resp.status}`);
		}

		const html = await resp.text();
		const results: SearchResult[] = [];

		// Parse the HTML SERP — DuckDuckGo organic results are in .result blocks
		const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
		const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gis;
		const titleRegex = /<[^>]+>([^<]+)<\/[^>]+>/g;

		// Simplified parsing — DuckDuckGo HTML is relatively stable
		const resultBlocks = html.split(/class="result\s/gi).slice(1);
		const maxResults = opts?.maxResults ?? 5;

		for (const block of resultBlocks.slice(0, maxResults)) {
			try {
				// Extract URL from the result link
				const linkMatch = block.match(/href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)/);
				if (!linkMatch) continue;
				const rawUrl = decodeURIComponent(linkMatch[1]);

				// Extract title
				const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
				const title = titleMatch
					? titleMatch[1].replace(/<[^>]+>/g, "").trim()
					: "";

				// Extract snippet
				const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
				const snippet = snippetMatch
					? snippetMatch[1].replace(/<[^>]+>/g, "").trim()
					: "";

				if (rawUrl && rawUrl.startsWith("http")) {
					results.push({ title, url: rawUrl, snippet });
				}
			} catch {
				// Skip malformed results
			}
		}

		return results;
	}
}
