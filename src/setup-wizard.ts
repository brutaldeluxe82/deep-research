/**
 * First-run setup wizard (RFC-2 §4).
 *
 * On first run, detects API keys from environment and shows the user:
 * 1. Which keys were found (transparency)
 * 2. What each provider is good for (education)
 * 3. How to add more keys later (actionable)
 *
 * The wizard does NOT ask the user to pick a "preferred provider" —
 * parallelSearch uses all available providers simultaneously anyway.
 * It also shows extraction providers (Firecrawl) separately.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, getConfigPath, writeDefaultConfig } from "../config.ts";

/** Search provider env key info. */
const SEARCH_KEY_INFO: Record<string, { label: string; desc: string; signupUrl: string }> = {
	BRAVE_API_KEY: {
		label: "Brave Search",
		desc: "High-quality web search. Best free option for research.",
		signupUrl: "https://api.search.brave.com/app/api-keys",
	},
	EXA_API_KEY: {
		label: "Exa",
		desc: "Neural/semantic search — finds conceptually relevant results.",
		signupUrl: "https://exa.ai",
	},
	TAVILY_API_KEY: {
		label: "Tavily",
		desc: "Purpose-built for AI agents. Clean results + extraction.",
		signupUrl: "https://tavily.com",
	},
};

/** Extraction provider env key info (separate from search). */
const EXTRACT_KEY_INFO: Record<string, { label: string; desc: string; signupUrl: string }> = {
	FIRECRAWL_API_KEY: {
		label: "Firecrawl",
		desc: "Renders JS, returns clean markdown from any URL. Best extractor.",
		signupUrl: "https://firecrawl.dev",
	},
};

export async function runSetupWizard(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	// Step 1: Detect what keys are available
	const searchDetected: Array<{ envVar: string; info: typeof SEARCH_KEY_INFO[string] }> = [];
	const searchMissing: Array<{ envVar: string; info: typeof SEARCH_KEY_INFO[string] }> = [];

	for (const [envVar, info] of Object.entries(SEARCH_KEY_INFO)) {
		if (process.env[envVar] && process.env[envVar]!.trim().length > 0) {
			searchDetected.push({ envVar, info });
		} else {
			searchMissing.push({ envVar, info });
		}
	}

	const extractDetected: Array<{ envVar: string; info: typeof EXTRACT_KEY_INFO[string] }> = [];
	const extractMissing: Array<{ envVar: string; info: typeof EXTRACT_KEY_INFO[string] }> = [];

	for (const [envVar, info] of Object.entries(EXTRACT_KEY_INFO)) {
		if (process.env[envVar] && process.env[envVar]!.trim().length > 0) {
			extractDetected.push({ envVar, info });
		} else {
			extractMissing.push({ envVar, info });
		}
	}

	// Step 2: Build a status message
	let message = "🔍 **Deep Research Setup**\n\n";

	// Search providers
	message += "**Search providers:**\n";
	if (searchDetected.length > 0) {
		for (const { envVar, info } of searchDetected) {
			message += `✅ ${info.label} (${envVar}) — ${info.desc}\n`;
		}
	}
	if (searchMissing.length > 0) {
		for (const { envVar, info } of searchMissing) {
			message += `➖ ${info.label} — ${info.desc}\n   Get a key: ${info.signupUrl}\n`;
		}
	}
	message += "✅ DuckDuckGo (zero-config, always available, lower quality)\n\n";

	// Extraction providers
	message += "**Content extractors:**\n";
	if (extractDetected.length > 0) {
		for (const { envVar, info } of extractDetected) {
			message += `✅ ${info.label} (${envVar}) — ${info.desc}\n`;
		}
	}
	if (extractMissing.length > 0) {
		for (const { envVar, info } of extractMissing) {
			message += `➖ ${info.label} — ${info.desc}\n   Get a key: ${info.signupUrl}\n`;
		}
	}
	message += "✅ Native HTTP (zero-config, basic HTML stripping)\n\n";

	// Summary
	if (searchDetected.length > 0) {
		message += `**You're all set!** Deep research will use ${searchDetected.map(d => d.info.label).join(" + ")} in parallel for maximum coverage.`;
	} else {
		message += "**No search API keys detected.** Deep research will use DuckDuckGo as fallback.\n";
		message += "For much better results, get a FREE Brave Search API key:\n";
		message += "👉 https://api.search.brave.com/app/api-keys\n";
		message += "Then add to your shell: `export BRAVE_API_KEY=your_key`";
	}

	// Step 3: Show the notification
	ctx.ui.notify(message, "info");

	// Step 4: Write config (marks wizard as complete)
	writeDefaultConfig();
}

/** Check if the wizard should run. Returns true if first-run. */
export function shouldRunWizard(): boolean {
	const config = loadConfig();
	return !config.setupWizardComplete;
}
