/**
 * deep_search tool — multi-provider parallel search with dedup.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, getConfigPath } from "../../config.ts";
import { registry } from "../../search/registry.ts";
import { parallelSearch } from "../../search/parallel-search.ts";

export function registerDeepSearch(pi: ExtensionAPI) {
	pi.registerTool({
		name: "deep_search",
		label: "Deep Search",
		description: [
			"Search the web using available providers in parallel.",
			"With API keys: fans out across Brave, Exa, Tavily simultaneously for maximum coverage.",
			"Without API keys: uses DuckDuckGo as zero-config fallback, or fall back to synthetic_web_search.",
			"Results are deduplicated by URL — much higher source coverage than single-provider search.",
			"Pass comma-separated queries to broaden across the topic.",
		].join(" "),
		parameters: Type.Object({
			query: Type.String({ description: "Search query (or comma-separated for multi-query fan-out)" }),
			max_results: Type.Optional(Type.Number({ description: "Max total results across all providers (default: 10, max: 20)", default: 10, maximum: 20 })),
			engine: Type.Optional(Type.String({ description: "Override engine: auto | brave | exa | tavily | scholar | duckduckgo" })),
			parallel: Type.Optional(Type.Boolean({ description: "Search multiple providers in parallel (default: true)", default: true })),
		}),

		async execute(_toolCallId, params) {
			const config = loadConfig();
			const rawQuery = params.query as string;
			const maxResults = Math.min((params.max_results as number) ?? 10, 20);
			const engineOverride = params.engine as string | undefined;
			const parallel = (params.parallel as boolean) ?? true;

			// Support comma-separated queries for fan-out
			const queries = rawQuery.split(",").map(q => q.trim()).filter(q => q.length > 0);

			if (!parallel || engineOverride) {
				// Single-provider mode
				const chain = engineOverride && engineOverride !== "auto"
					? [engineOverride]
					: config.searchFallbackChain;

				const { results, provider, tried } = await registry.searchWithFallback(
					queries[0],
					chain,
					{ maxResults },
				);

				if (results.length === 0) {
					const hasPaidKeys = tried.some(p => p !== "duckduckgo");
					let helpText = `No results found for "${queries[0]}" via ${tried.join(", ")}.`;
					if (hasPaidKeys) {
						helpText += `\n\nThis may be a temporary API issue. Try:`;
						helpText += `\n- A different query phrasing`;
						helpText += `\n- The \`synthetic_web_search\` tool as an alternative`;
						helpText += `\n- Check your API keys are valid in ${getConfigPath()}`;
					} else {
						helpText += `\n\n**No search API keys configured.** Deep research works best with API keys.`;
						helpText += `\nTo set up (2 minutes):`;
						helpText += `\n1. Get a FREE Brave Search API key: https://api.search.brave.com/app/api-keys`;
						helpText += `\n2. Add to your shell: export BRAVE_API_KEY=your_key`;
						helpText += `\n3. Restart this session`;
						helpText += `\n\nAlternatively, try the \`synthetic_web_search\` tool if pi-synthetic is installed.`;
					}
					return {
						content: [{ type: "text" as const, text: helpText }],
						details: {},
					};
				}

				let text = `Found ${results.length} results via ${provider}:\n\n`;
				for (let i = 0; i < results.length; i++) {
					const r = results[i];
					text += `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`;
					if (r.score) text += ` (relevance: ${(r.score * 100).toFixed(0)}%)`;
					if (r.date) text += ` | ${r.date}`;
					text += "\n\n";
				}
				return { content: [{ type: "text" as const, text }], details: {} };
			}

			// Parallel mode: fan out across all available providers
			const { results, providers } = await parallelSearch(queries, maxResults, config);

			if (results.length === 0) {
				const availableProviders = registry.listAvailableSearchProviders().map(p => p.name);
				const hasPaidKeys = availableProviders.some(p => p !== "duckduckgo");

				let helpText = `No results found for "${rawQuery}".`;
				if (!hasPaidKeys) {
					helpText += `\n\n**No search API keys configured.** Deep research works best with API keys.\n`;
					helpText += `To set up (takes 2 minutes):\n`;
					helpText += `1. Get a FREE Brave Search API key: https://api.search.brave.com/app/api-keys\n`;
					helpText += `2. Add to your shell: export BRAVE_API_KEY=your_key\n`;
					helpText += `3. Restart this session\n\n`;
					helpText += `Alternative: use the \`synthetic_web_search\` tool directly for basic results.`;
				}
				return {
					content: [{ type: "text" as const, text: helpText }],
					details: {},
				};
			}

			let text = `Found ${results.length} results via ${providers.length} providers (${providers.join(", ")}):\n\n`;
			for (let i = 0; i < results.length; i++) {
				const r = results[i];
				const credTier = assessCredibilityQuick(r.url);
				text += `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`;
				if (r.source) text += ` [${r.source}]`;
				text += ` [${credTier}]`;
				if (r.date) text += ` | ${r.date}`;
				text += "\n\n";
			}

			text += `\n_Used ${providers.length} providers in parallel — ${results.length} unique results after dedup._`;

			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});
}

/** Quick credibility tier from URL — used for search result annotations. */
function assessCredibilityQuick(url: string): string {
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
