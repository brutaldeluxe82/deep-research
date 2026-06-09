/**
 * Deep Research — main extension entry point.
 *
 * Registers 5 pi tools. Each tool's implementation lives in its own file
 * under src/tools/. This file handles lifecycle (config caching, provider
 * registration) and tool wiring only.
 *
 * Config is loaded once at session_start and cached — tools read from
 * the cache, not from disk on every call.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, getConfigPath, resetConfigCache } from "../src/config.ts";
import { registerProviders } from "../src/search/index.ts";
import { registry } from "../src/search/registry.ts";
import { shouldRunWizard, runSetupWizard } from "../src/setup-wizard.ts";
import { ProviderHealth } from "../src/search/provider-health.ts";
import { resetRound } from "../src/research/round-tracker.ts";
import { resetSourceTracker } from "../src/research/source-tracker.ts";
import { registerDeepSearch } from "../src/tools/search.ts";
import { registerDeepExtract } from "../src/tools/extract.ts";
import { registerResearchCheckpoint } from "../src/tools/checkpoint.ts";
import { registerResearchOutline } from "../src/tools/outline.ts";
import { registerResearchReport } from "../src/tools/report.ts";

let currentCtx: ExtensionContext | undefined;

export default function (pi: ExtensionAPI) {
	// ── Session lifecycle ──────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		currentCtx = ctx;

		// Load config once — tools read from cached config after this
		const config = loadConfig();
		registerProviders(config);

		// First-run wizard
		if (shouldRunWizard() && currentCtx) {
			try {
				await runSetupWizard(pi, currentCtx);
			} catch {
				// Wizard failed or cancelled — non-blocking
			}
		}

		// Status — only count providers that actually return results
		const searchProviders = registry.listAvailableSearchProviders()
			.filter(p => p.name !== "synthetic"); // synthetic is a different extension, not ours
		const extractors = registry.listAvailableExtractors();
		const hasKeys = searchProviders.some(p => p.name !== "duckduckgo");
		ctx.ui.setStatus("deep-research", hasKeys
			? `${searchProviders.length} search providers, ${extractors.length} extractors`
			: `${searchProviders.length} search provider (DuckDuckGo only — add API keys for better results)`,
		);
	});

	pi.on("session_shutdown", () => {
		currentCtx = undefined;
		ProviderHealth.reset();
		resetConfigCache();
		resetRound();
		resetSourceTracker();
	});

	// ── Tool registration ──────────────────────────────────────────────────────

	registerDeepSearch(pi);
	registerDeepExtract(pi);
	registerResearchCheckpoint(pi);
	registerResearchOutline(pi);
	registerResearchReport(pi);
}
