/**
 * First-run setup wizard.
 *
 * On first run, detects API keys from environment and shows the user:
 * 1. Which keys were found (transparency)
 * 2. What each provider is good for (education)
 * 3. How to add more keys later (actionable)
 *
 * The "preferred provider" concept was removed — parallelSearch uses
 * all available providers simultaneously anyway, so picking one
 * "preferred" provider was misleading.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, getConfigPath, writeDefaultConfig } from "../config.ts";
import { KNOWN_PROVIDERS, type ProviderName } from "../search/types.ts";

/** Maps env var names to human-readable info. */
const ENV_KEY_INFO: Record<string, { label: string; desc: string; signupUrl: string }> = {
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

/** Maps env var name to config key name. */
const ENV_TO_CONFIG_KEY: Record<string, string> = {
	BRAVE_API_KEY: "brave",
	EXA_API_KEY: "exa",
	TAVILY_API_KEY: "tavily",
};

export async function runSetupWizard(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	// Step 1: Detect what keys are available
	const detected: Array<{ envVar: string; info: typeof ENV_KEY_INFO[string] }> = [];
	const missing: Array<{ envVar: string; info: typeof ENV_KEY_INFO[string] }> = [];

	for (const [envVar, info] of Object.entries(ENV_KEY_INFO)) {
		if (process.env[envVar] && process.env[envVar]!.trim().length > 0) {
			detected.push({ envVar, info });
		} else {
			missing.push({ envVar, info });
		}
	}

	// Step 2: Build a status message
	let message = "🔍 **Deep Research Setup**\n\n";

	if (detected.length > 0) {
		message += "**API keys found in your environment:**\n";
		for (const { envVar, info } of detected) {
			message += `✅ ${info.label} (${envVar}) — ${info.desc}\n`;
		}
		message += "\n";
	}

	if (missing.length > 0) {
		message += "**Available providers (need API keys):**\n";
		for (const { envVar, info } of missing) {
			message += `➖ ${info.label} — ${info.desc}\n   Get a key: ${info.signupUrl}\n`;
		}
		message += "\n";
	}

	// DuckDuckGo is always available but limited
	message += "**Zero-config:** DuckDuckGo (always works, lower quality)\n\n";

	if (detected.length > 0) {
		message += `You're all set! Deep research will use ${detected.map(d => d.info.label).join(" + ")} in parallel for maximum coverage.`;
	} else {
		message += "**No API keys detected.** Deep research will use DuckDuckGo as fallback.\n";
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
