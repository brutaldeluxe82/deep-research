/**
 * Session-scoped source tracker for deep_extract.
 *
 * Records which URLs have been extracted, avoiding double-counting.
 * The host LLM manages evidence; this module just deduplicates sources.
 */

/** Quick credibility assessment from URL hostname. */
function assessCredibility(url: string): "tier-1" | "tier-2" | "tier-3" {
	try {
		const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
		const tier1 = ["arxiv.org", "nature.com", "science.org", "doi.org", "gov", "edu",
			"reuters.com", "apnews.com", "bbc.com", "deepmind.google", "openai.com", "anthropic.com"];
		if (tier1.some(t => host.endsWith(t) || host.includes(t))) return "tier-1";
		const tier2 = ["github.com", "stackoverflow.com", "medium.com", "techcrunch.com",
			"theverge.com", "wired.com", "docs.", "wiki"];
		if (tier2.some(t => host.includes(t))) return "tier-2";
		return "tier-3";
	} catch {
		return "tier-3";
	}
}

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

const extractedUrls = new Set<string>();

/**
 * Record that a source was extracted (call after successful extraction).
 * Returns true if this URL is new (not previously extracted).
 */
export function recordExtractedSource(url: string, _title: string, _snippet: string): boolean {
	const normalizedUrl = normalizeUrl(url);
	if (extractedUrls.has(normalizedUrl)) return false;
	extractedUrls.add(normalizedUrl);
	return true;
}

/** Get the credibility tier for a URL. */
export function getCredibility(url: string): "tier-1" | "tier-2" | "tier-3" {
	return assessCredibility(url);
}

/** Reset for a new session. */
export function resetSourceTracker(): void {
	extractedUrls.clear();
}
