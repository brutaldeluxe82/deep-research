/**
 * Semantic Scholar API provider — academic paper search.
 * Docs: https://api.semanticscholar.org/api-docs/graph
 *
 * FREE, zero-config API. No key required for basic usage.
 * An optional SEMANTIC_SCHOLAR_API_KEY enables higher rate limits.
 *
 * Contract (RFC-2 §5):
 * - Uses only node:fetch (no external deps)
 * - isAvailable() is honest: true by default (free API)
 * - search() catches all errors and returns [] (never throws)
 * - Handles DNS failures, rate limits, and timeouts gracefully
 * - Timeout: 15s
 */

import type { SearchProvider, SearchResult, SearchOptions } from "../types.ts";

export interface ScholarSearchResult extends SearchResult {
	/** Paper authors. */
	authors?: string[];
	/** Publication year. */
	year?: number;
	/** Number of citations. */
	citationCount?: number;
	/** Whether the paper is open access. */
	openAccess?: boolean;
	/** DOI if available. */
	doi?: string;
	/** Venue (journal/conference name). */
	venue?: string;
	/** Fields of study. */
	fieldsOfStudy?: string[];
}

export class ScholarSearchProvider implements SearchProvider {
	readonly name = "scholar";
	readonly label = "Semantic Scholar";
	private readonly apiKey: string;
	private readonly baseUrl = "https://api.semanticscholar.org/graph/v1";

	constructor(apiKey: string = "") {
		this.apiKey = (apiKey ?? "").trim();
	}

	isAvailable(): boolean {
		// Semantic Scholar API is free — always available.
		// An API key just gives higher rate limits.
		return true;
	}

	async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
		try {
			const url = new URL(`${this.baseUrl}/paper/search`);
			url.searchParams.set("query", query);
			url.searchParams.set("limit", String(Math.min(opts?.maxResults ?? 10, 100)));
			url.searchParams.set("fields", "title,abstract,url,year,authors,citationCount,isOpenAccess,externalIds,venue,fieldsOfStudy");

			// Year filters
			if (opts?.recency === "year") {
				const currentYear = new Date().getFullYear();
				url.searchParams.set("year", `${currentYear}-${currentYear}`);
			} else if (opts?.recency === "month") {
				// Semantic Scholar doesn't support month-level recency; use current year
				const currentYear = new Date().getFullYear();
				url.searchParams.set("year", `${currentYear}-${currentYear}`);
			}

			const headers: Record<string, string> = {
				"Accept": "application/json",
			};

			if (this.apiKey) {
				headers["x-api-key"] = this.apiKey;
			}

			const resp = await fetch(url.toString(), {
				headers,
				signal: AbortSignal.timeout(15000),
			});

			if (!resp.ok) {
				// Rate limited or server error — return empty, don't throw
				return [];
			}

			const data = await resp.json() as any;
			const results: SearchResult[] = [];

			for (const item of (data.data ?? [])) {
				const authors = (item.authors ?? []).map((a: any) => a.name ?? "").filter(Boolean);
				const arxivId = item.externalIds?.ArXiv;
				const doi = item.externalIds?.DOI;

				let resultUrl = item.url ?? "";
				// Prefer arxiv URL for accessibility
				if (arxivId) {
					resultUrl = `https://arxiv.org/abs/${arxivId}`;
				} else if (doi) {
					resultUrl = `https://doi.org/${doi}`;
				}

				results.push({
					title: item.title ?? "",
					url: resultUrl,
					snippet: item.abstract ?? "",
					date: item.year ? String(item.year) : undefined,
					source: "scholar",
					score: item.citationCount ? Math.min(item.citationCount / 100, 1) : undefined,
					// Extended fields stored on the result object
					authors: authors.length > 0 ? authors : undefined,
					year: item.year ?? undefined,
					citationCount: item.citationCount ?? undefined,
					openAccess: item.isOpenAccess ?? undefined,
					doi: doi ?? undefined,
					venue: item.venue ?? undefined,
					fieldsOfStudy: item.fieldsOfStudy ?? undefined,
				} as ScholarSearchResult);
			}

			return results;
		} catch {
			// DNS failure, timeout, network error — return empty, let fallback chain continue
			return [];
		}
	}
}
