/**
 * DuckDuckGo Search provider — zero-config fallback.
 *
 * Uses DDG's HTML instant-answer API (html.duckduckgo.com).
 * Falls back to the lite version (lite.duckduckgo.com) which has
 * simpler HTML that's less likely to break on layout changes.
 *
 * This is the ONLY provider that works without an API key.
 * Quality is lower than Brave/Exa but it needs zero setup.
 *
 * 
 * - Uses only node:fetch (no external deps)
 * - isAvailable() returns true (no key needed)
 * - search() catches all errors and returns [] (never throws)
 * - Handles DNS failures, rate limits, and timeouts gracefully
 * - Timeout: 12s
 * - No state between calls (no cookies, no session)
 *
 * DuckDuckGo exception: isAvailable()=true even though
 * results may be empty (rate-limited, blocked). This is acceptable
 * because it CAN return results, unlike phantom providers that NEVER can.
 */

import type { SearchProvider, SearchResult, SearchOptions } from "../types.ts";

export class DuckDuckGoSearchProvider implements SearchProvider {
	readonly name = "duckduckgo";
	readonly label = "DuckDuckGo";

	isAvailable(): boolean {
		return true; // No API key needed — zero-config
	}

	async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
		const maxResults = opts?.maxResults ?? 5;

		// Try the main HTML endpoint first
		const results = await this.searchHtml(query, maxResults);

		// If that failed, try the lite version (simpler HTML, more resilient)
		if (results.length === 0) {
			return this.searchLite(query, maxResults);
		}

		return results;
	}

	/** Parse the main DDG HTML SERP. */
	private async searchHtml(query: string, maxResults: number): Promise<SearchResult[]> {
		try {
			const url = new URL("https://html.duckduckgo.com/html/");
			url.searchParams.set("q", query);

			const resp = await fetch(url.toString(), {
				headers: {
					"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
					"Accept": "text/html",
				},
				signal: AbortSignal.timeout(12000),
			});

			if (!resp.ok) return [];

			const html = await resp.text();
			return this.parseHtmlResults(html, maxResults);
		} catch {
			return [];
		}
	}

	/** Parse the simpler DDG Lite SERP — fallback when main HTML fails. */
	private async searchLite(query: string, maxResults: number): Promise<SearchResult[]> {
		try {
			const url = new URL("https://lite.duckduckgo.com/lite/");
			url.searchParams.set("q", query);

			const resp = await fetch(url.toString(), {
				headers: {
					"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
					"Accept": "text/html",
				},
				signal: AbortSignal.timeout(12000),
			});

			if (!resp.ok) return [];

			const html = await resp.text();
			return this.parseLiteResults(html, maxResults);
		} catch {
			return [];
		}
	}

	/** Parse main DDG HTML results. */
	private parseHtmlResults(html: string, maxResults: number): SearchResult[] {
		const results: SearchResult[] = [];

		const resultBlocks = html.split(/class="result\s/gi).slice(1);

		for (const block of resultBlocks.slice(0, maxResults)) {
			try {
				const linkMatch = block.match(/href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)/);
				if (!linkMatch) continue;
				const rawUrl = decodeURIComponent(linkMatch[1]);

				const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
				const title = titleMatch
					? titleMatch[1].replace(/<[^>]+>/g, "").trim()
					: "";

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

	/** Parse DDG Lite results — much simpler HTML structure.
	 *  Lite uses table rows: each result is a <tr> with a link in the
	 *  first cell and snippet in the second. */
	private parseLiteResults(html: string, maxResults: number): SearchResult[] {
		const results: SearchResult[] = [];

		// Lite format: <a rel="nofollow" href="URL">Title</a>
		const linkRegex = /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
		const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

		// Collect all links first
		const links: Array<{ url: string; title: string }> = [];
		let match: RegExpExecArray | null;

		while ((match = linkRegex.exec(html)) !== null) {
			const url = match[1];
			const title = match[2].replace(/<[^>]+>/g, "").trim();
			if (url && url.startsWith("http") && title) {
				links.push({ url, title });
			}
		}

		// Collect snippets
		const snippets: string[] = [];
		while ((match = snippetRegex.exec(html)) !== null) {
			snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
		}

		// Merge — lite format has links and snippets in alternating rows
		const count = Math.min(links.length, maxResults);
		for (let i = 0; i < count; i++) {
			results.push({
				title: links[i].title,
				url: links[i].url,
				snippet: snippets[i] ?? "",
			});
		}

		return results;
	}
}
