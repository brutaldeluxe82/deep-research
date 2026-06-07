/**
 * First-run setup wizard.
 *
 * Detected API keys from env → present user with available providers →
 * let them pick preferred → write config → done.
 *
 * Runs once. Sets setupWizardComplete=true in config to prevent re-runs.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, writeDefaultConfig } from "../config.ts";
import type { DeepResearchConfig } from "../config.ts";
import { KNOWN_PROVIDERS, type ProviderName } from "../search/types.ts";

/** Human-readable names and descriptions for each provider. */
const PROVIDER_INFO: Record<string, { label: string; desc: string }> = {
	brave:       { label: "Brave Search",         desc: "High-quality web search. Requires BRAVE_API_KEY." },
	exa:         { label: "Exa (Metaphor)",        desc: "Neural/semantic search — finds conceptually relevant results. Requires EXA_API_KEY." },
	tavily:      { label: "Tavily",                desc: "Purpose-built for AI agents. Clean results + optional extraction. Requires TAVILY_API_KEY." },
	firecrawl:   { label: "Firecrawl",             desc: "JS-rendered page extraction + search. Great for reading full pages. Requires FIRECRAWL_API_KEY." },
	duckduckgo:  { label: "DuckDuckGo",            desc: "Free, no API key needed. Lower quality but always available." },
	synthetic:   { label: "Synthetic (pi built-in)",desc: "Pi's built-in zero-data-retention search. Always available." },
	serper:      { label: "Serper",                desc: "Google results via API. Requires SERPER_API_KEY." },
	google:      { label: "Google Custom Search",   desc: "Google programmable search. Requires GOOGLE_API_KEY." },
	gemini:      { label: "Gemini Search",          desc: "Google Gemini grounded search. Requires GEMINI_API_KEY." },
};

export async function runSetupWizard(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	const config = loadConfig();

	// Detect what's available
	const available = detectAvailable(config);

	if (available.length === 0) {
		// Shouldn't happen (duckduckgo + synthetic are always available)
		ctx.ui.notify("Deep Research: No search providers available!", "error");
		return;
	}

	// Build the options list
	const options = available.map((name) => {
		const info = PROVIDER_INFO[name] ?? { label: name, desc: "" };
		return {
			label: info.label,
			description: info.desc,
		};
	});

	// Add "Auto (recommended)" which uses the fallback chain
	options.unshift({
		label: "Auto (Recommended)",
		description: `Tries each provider in order: ${config.searchFallbackChain.filter(p => available.includes(p)).join(" → ")}`,
	});

	const choice = await ctx.ui.select(
		"Deep Research Setup",
		"Choose your preferred search provider. You can change this later in " + getConfigPath(),
		options.map((o) => o.label),
	);

	// Map choice back to provider name
	let preferred = "auto";
	if (choice && choice !== "Auto (Recommended)") {
		const idx = options.findIndex((o) => o.label === choice);
		if (idx > 0) { // idx 0 is "Auto"
			preferred = available[idx - 1];
		}
	}

	// Write config
	const configPath = writeDefaultConfig();

	// Update preferred provider in the just-written config
	const fs = await import("node:fs");
	const existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
	existing.preferredSearchProvider = preferred;
	fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n", { mode: 0o600 });

	ctx.ui.notify(
		`Deep Research configured! Preferred: ${preferred}. Config: ${configPath}`,
		"info",
	);
}

function detectAvailable(config: DeepResearchConfig): ProviderName[] {
	const available: ProviderName[] = [];

	for (const name of KNOWN_PROVIDERS) {
		if (name === "synthetic" || name === "duckduckgo") {
			available.push(name);
			continue;
		}
		const key = (config.apiKeys as Record<string, string>)[name];
		if (key && key.trim().length > 0) {
			available.push(name);
		}
	}

	return available;
}

/** Check if the wizard should run. Returns true if first-run. */
export function shouldRunWizard(): boolean {
	const config = loadConfig();
	return !config.setupWizardComplete;
}
