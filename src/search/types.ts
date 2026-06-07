/**
 * Search Provider Adapter Interface
 *
 * Adding a new search vendor:
 * 1. Create a file in ./providers/ implementing SearchProvider
 * 2. Add the provider name to KNOWN_PROVIDERS below
 * 3. Add the env var key to ENV_KEY_MAP
 * 4. That's it — the registry auto-discovers it
 */

/** Normalized search result from any provider. */
export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	date?: string;
	source?: string;
	score?: number;
}

/** Options passed to search calls. */
export interface SearchOptions {
	maxResults?: number;
	recency?: "day" | "week" | "month" | "year" | "all";
	includeDomains?: string[];
	excludeDomains?: string[];
}

/** Adapter interface — every search provider implements this. */
export interface SearchProvider {
	/** Unique identifier: "brave", "exa", "duckduckgo", etc. */
	readonly name: string;

	/** Human-readable label for UI. */
	readonly label: string;

	/** True when this provider has everything it needs to run (API key, etc.) */
	isAvailable(): boolean;

	/** Execute a search and return normalized results. */
	search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
}

/** Content extraction result. */
export interface ExtractResult {
	title: string;
	url: string;
	content: string;
	contentType: "text" | "markdown" | "html";
	wordCount: number;
	truncated: boolean;
}

/** Content extractor interface — vendors that can read full page content. */
export interface ContentExtractor {
	readonly name: string;
	readonly label: string;
	isAvailable(): boolean;
	extract(url: string, opts?: { maxTokens?: number; format?: "text" | "markdown" | "html" }): Promise<ExtractResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry — the adapter pattern that makes adding vendors trivial
// ─────────────────────────────────────────────────────────────────────────────

/** Maps provider names to their env var keys for auto-detection. */
const ENV_KEY_MAP: Record<string, string> = {
	brave:       "BRAVE_API_KEY",
	exa:         "EXA_API_KEY",
	tavily:      "TAVILY_API_KEY",
	firecrawl:   "FIRECRAWL_API_KEY",
	serper:      "SERPER_API_KEY",
	google:      "GOOGLE_API_KEY",
	gemini:      "GEMINI_API_KEY",
};

/** Ordered list of all known provider names. Used by the wizard. */
export const KNOWN_PROVIDERS = [
	"brave",
	"exa",
	"tavily",
	"firecrawl",
	"duckduckgo",
	"serper",
	"google",
	"gemini",
	"synthetic",
] as const;

export type ProviderName = typeof KNOWN_PROVIDERS[number];

/** Detect which providers are available based on env vars and config. */
export function detectAvailableProviders(configKeys: Record<string, string> = {}): ProviderName[] {
	const available: ProviderName[] = [];

	for (const name of KNOWN_PROVIDERS) {
		if (name === "synthetic") {
			// Synthetic is always available inside pi
			available.push(name);
			continue;
		}
		if (name === "duckduckgo") {
			// DuckDuckGo scraping works without an API key
			available.push(name);
			continue;
		}
		// Check config first, then env var
		const configVal = configKeys[name];
		const envKey = ENV_KEY_MAP[name];
		const envVal = envKey ? process.env[envKey] : undefined;
		if ((configVal && configVal.trim().length > 0) || (envVal && envVal.trim().length > 0)) {
			available.push(name);
		}
	}

	return available;
}

/** Get the API key for a provider: config override → env var. */
export function resolveApiKey(name: string, configKeys: Record<string, string> = {}): string {
	const configVal = configKeys[name];
	if (configVal && configVal.trim().length > 0) return configVal.trim();

	const envKey = ENV_KEY_MAP[name];
	if (envKey) {
		const envVal = process.env[envKey];
		if (envVal && envVal.trim().length > 0) return envVal.trim();
	}

	return "";
}
