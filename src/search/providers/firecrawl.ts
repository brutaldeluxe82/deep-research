/**
 * Firecrawl provider — extraction specialist.
 * Docs: https://docs.firecrawl.dev/
 *
 * Env: FIRECRAWL_API_KEY
 * Config: apiKeys.firecrawl
 *
 * Firecrawl excels at deep page extraction: it renders JS,
 * handles pagination, and returns clean markdown. Ideal for
 * the "visit and extract" step of deep research.
 *
 * RFC-2 decision: Firecrawl is extraction-only. Its /v1/search
 * endpoint is limited compared to Brave/Exa/Tavily. Using it as
 * a search provider wasted a parallel fan-out slot. The search
 * class is kept in case we re-evaluate (RFC-2 §6.6).
 *
 * Contract (RFC-2 §5):
 * - Uses only node:fetch (no external deps)
 * - isAvailable() is honest: true only if API key is present
 * - extract() catches DNS/network errors, lets API errors propagate
 * - Timeout: 30s for extract (JS rendering is slow), 15s for search
 */

import type { SearchProvider, SearchResult, SearchOptions, ContentExtractor, ExtractResult } from "../types.ts";

/**
 * Firecrawl Search — kept but NOT registered in the default search chain.
 * Available for manual engine override: engine="firecrawl".
 * See RFC-2 §6.6 for re-evaluation notes.
 */
export class FirecrawlSearchProvider implements SearchProvider {
	readonly name = "firecrawl";
	readonly label = "Firecrawl Search";
	private readonly apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = (apiKey ?? "").trim();
	}

	isAvailable(): boolean {
		return this.apiKey.length > 0;
	}

	async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
		try {
			const resp = await fetch("https://api.firecrawl.dev/v1/search", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					query,
					limit: opts?.maxResults ?? 5,
				}),
				signal: AbortSignal.timeout(15000),
			});

			if (!resp.ok) return [];

			const data = await resp.json() as any;
			const results: SearchResult[] = [];

			for (const item of (data.data ?? [])) {
				results.push({
					title: item.metadata?.title ?? "",
					url: item.metadata?.sourceURL ?? item.url ?? "",
					snippet: item.markdown?.slice(0, 300) ?? "",
					source: item.metadata?.author ?? undefined,
				});
			}

			return results;
		} catch {
			return [];
		}
	}
}

/**
 * Firecrawl Content Extractor — the main value.
 * Returns clean markdown from any URL, including JS-rendered pages.
 */
export class FirecrawlContentExtractor implements ContentExtractor {
	readonly name = "firecrawl";
	readonly label = "Firecrawl Extract";
	private readonly apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = (apiKey ?? "").trim();
	}

	isAvailable(): boolean {
		return this.apiKey.length > 0;
	}

	async extract(url: string, opts?: { maxTokens?: number; format?: "text" | "markdown" | "html" }): Promise<ExtractResult> {
		try {
			const maxChars = (opts?.maxTokens ?? 5000) * 4;
			const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					url,
					formats: ["markdown"],
				}),
				signal: AbortSignal.timeout(30000),
			});

			if (!resp.ok) {
				throw new Error(`Firecrawl extract returned ${resp.status}: ${await resp.text()}`);
			}

			const data = await resp.json() as any;
			const content = data.data?.markdown ?? data.data?.html ?? "";
			const title = data.data?.metadata?.title ?? url;
			const words = content.split(/\s+/);

			return {
				title,
				url,
				content: words.length > maxChars / 4 ? words.slice(0, maxChars / 4).join(" ") + "\n\n[... truncated]" : content,
				contentType: (opts?.format ?? "markdown") as "markdown",
				wordCount: words.length,
				truncated: words.length > maxChars / 4,
			};
		} catch (err) {
			throw new Error(`Firecrawl extraction failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}
