/**
 * Exa (Metaphor) Search API provider.
 * Docs: https://docs.exa.ai/reference/search
 *
 * Env: EXA_API_KEY
 * Config: apiKeys.exa
 */

import type { SearchProvider, SearchResult, SearchOptions } from "../types.ts";

export class ExaSearchProvider implements SearchProvider {
	readonly name = "exa";
	readonly label = "Exa Search";
	private readonly apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = (apiKey ?? "").trim();
	}

	isAvailable(): boolean {
		return this.apiKey.length > 0;
	}

	async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
		const body: Record<string, any> = {
			query,
			numResults: opts?.maxResults ?? 5,
			type: "neural",         // Exa's neural search is the differentiator
			contents: {
				text: { maxCharacters: 200 }, // Snippet-sized preview
			},
		};

		if (opts?.includeDomains?.length) {
			body.includeDomains = opts.includeDomains;
		}
		if (opts?.excludeDomains?.length) {
			body.excludeDomains = opts.excludeDomains;
		}
		if (opts?.recency && opts.recency !== "all") {
			const days = { day: 1, week: 7, month: 30, year: 365 }[opts.recency];
			if (days) body.startPublishedDate = new Date(Date.now() - days * 86400000).toISOString();
		}

		const resp = await fetch("https://api.exa.ai/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": this.apiKey,
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(15000),
		});

		if (!resp.ok) {
			throw new Error(`Exa API returned ${resp.status}: ${await resp.text()}`);
		}

		const data = await resp.json() as any;
		const results: SearchResult[] = [];

		for (const item of (data.results ?? [])) {
			results.push({
				title: item.title ?? "",
				url: item.url ?? "",
				snippet: item.text ?? item.highlight ?? "",
				date: item.publishedDate ?? undefined,
				score: item.score ?? undefined,
			});
		}

		return results;
	}
}

/**
 * Exa also implements ContentExtractor — it can return full page content
 * via the /contents endpoint, which is higher quality than raw HTML scraping.
 */

import type { ContentExtractor, ExtractResult } from "../types.ts";

export class ExaContentExtractor implements ContentExtractor {
	readonly name = "exa";
	readonly label = "Exa Content";
	private readonly apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = (apiKey ?? "").trim();
	}

	isAvailable(): boolean {
		return this.apiKey.length > 0;
	}

	async extract(url: string, opts?: { maxTokens?: number; format?: "text" | "markdown" | "html" }): Promise<ExtractResult> {
		const maxChars = (opts?.maxTokens ?? 5000) * 4; // rough token→char estimate

		const resp = await fetch("https://api.exa.ai/contents", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": this.apiKey,
			},
			body: JSON.stringify({
				ids: [url],
				text: { maxCharacters: maxChars },
			}),
			signal: AbortSignal.timeout(15000),
		});

		if (!resp.ok) {
			throw new Error(`Exa Contents API returned ${resp.status}`);
		}

		const data = await resp.json() as any;
		const item = data.results?.[0];

		if (!item?.text) {
			throw new Error("Exa returned no content");
		}

		const content = item.text;
		const words = content.split(/\s+/);

		return {
			title: item.title ?? url,
			url,
			content: words.length > maxChars / 4 ? words.slice(0, maxChars / 4).join(" ") + "\n\n[... truncated]" : content,
			contentType: "text",
			wordCount: words.length,
			truncated: words.length > maxChars / 4,
		};
	}
}
