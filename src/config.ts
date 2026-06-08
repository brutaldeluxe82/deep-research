/**
 * Deep Research Configuration
 *
 * Config file: $PI_CODING_AGENT_DIR/deep-research.json
 * Falls back to: ~/.config/pi/deep-research.json → ~/.pi/agent/deep-research.json
 *
 * API keys are resolved: config file → env var → absent (skip provider)
 * Zero-config: DuckDuckGo + Synthetic search always work.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

// ─────────────────────────────────────────────────────────────────────────────
// Config path resolution — matches pi's own conventions
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve the pi config directory using the same logic as pi itself. */
function getPiConfigDir(): string {
	// 1. Explicit env var (set via mise: PI_CODING_AGENT_DIR=~/.config/pi)
	const envDir = process.env.PI_CODING_AGENT_DIR;
	if (envDir) {
		if (envDir === "~") return homedir();
		if (envDir.startsWith("~/")) return homedir() + envDir.slice(1);
		return envDir;
	}
	// 2. XDG fallback
	const xdg = process.env.XDG_CONFIG_HOME;
	if (xdg) return path.join(xdg, "pi");
	// 3. Default
	return path.join(homedir(), ".pi", "agent");
}

export function getConfigPath(): string {
	return path.join(getPiConfigDir(), "deep-research.json");
}

// ─────────────────────────────────────────────────────────────────────────────
// Type definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface DeepResearchConfig {
	/** Preferred search provider. "auto" uses fallback chain. */
	preferredSearchProvider: string;

	/** Ordered fallback chain for search. First available wins. */
	searchFallbackChain: string[];

	/** Ordered fallback chain for content extraction. */
	extractFallbackChain: string[];

	/** API keys (config file overrides env vars). */
	apiKeys: {
		brave?: string;
		exa?: string;
		tavily?: string;
		firecrawl?: string;
		serper?: string;
		google?: string;
		gemini?: string;
	};

	/** Max search results per query. */
	maxSearchResults: number;

	/** Research depth defaults. */
	depth: {
		quick:    { maxRounds: number; maxSources: number; maxTimeSeconds: number };
		standard: { maxRounds: number; maxSources: number; maxTimeSeconds: number };
		deep:     { maxRounds: number; maxSources: number; maxTimeSeconds: number };
	};

	/** Content extraction limits. */
	extraction: {
		maxTokensPerPage: number;
		timeoutMs: number;
	};

	/** Whether to prompt the setup wizard on first run. */
	setupWizardComplete: boolean;

	/** Whether sandboxed code execution is enabled. */
	codeExecutionEnabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS: DeepResearchConfig = {
	preferredSearchProvider: "auto",
	searchFallbackChain: [
		"brave",        // If BRAVE_API_KEY present → best quality
		"exa",          // If EXA_API_KEY present → neural search
		"tavily",       // If TAVILY_API_KEY present → agent-optimized
		"scholar",      // Semantic Scholar — free academic search (no key needed)
		"duckduckgo",   // Always available, no key needed — zero-config fallback
	],
	extractFallbackChain: [
		"firecrawl",    // If FIRECRAWL_API_KEY present → JS rendering, clean markdown
		"exa",          // If EXA_API_KEY present -> clean content via API
		"native",       // Always available: httpx + HTML stripping
	],
	apiKeys: {},
	maxSearchResults: 10,
	depth: {
		quick:    { maxRounds: 2, maxSources: 15,  maxTimeSeconds: 120 },
		standard: { maxRounds: 6, maxSources: 40,  maxTimeSeconds: 480 },
		deep:     { maxRounds: 10, maxSources: 60,  maxTimeSeconds: 1200 },
	},
	extraction: {
		maxTokensPerPage: 8000,
		timeoutMs: 20000,
	},
	setupWizardComplete: false,
	codeExecutionEnabled: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Env var → config key mapping
// ─────────────────────────────────────────────────────────────────────────────

const ENV_KEY_MAP: Record<string, string> = {
	brave:     "BRAVE_API_KEY",
	exa:       "EXA_API_KEY",
	tavily:    "TAVILY_API_KEY",
	firecrawl: "FIRECRAWL_API_KEY",
	scholar:   "SEMANTIC_SCHOLAR_API_KEY",
	serper:    "SERPER_API_KEY",
	google:    "GOOGLE_API_KEY",
	gemini:    "GEMINI_API_KEY",
};

/** Resolve an API key: config value → env var. */
function resolveKey(configVal: string | undefined, envVar: string): string {
	if (configVal && configVal.trim().length > 0) return configVal.trim();
	const envVal = process.env[envVar];
	if (envVal && envVal.trim().length > 0) return envVal.trim();
	return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Load + merge
// ─────────────────────────────────────────────────────────────────────────────

export function loadConfig(): DeepResearchConfig {
	const configPath = getConfigPath();
	const result: DeepResearchConfig = JSON.parse(JSON.stringify(DEFAULTS));

	try {
		if (fs.existsSync(configPath)) {
			const raw = fs.readFileSync(configPath, "utf-8");
			const user = JSON.parse(raw) as Partial<DeepResearchConfig>;

			// Shallow merge for top-level keys
			if (user.preferredSearchProvider) result.preferredSearchProvider = user.preferredSearchProvider;
			if (user.searchFallbackChain) result.searchFallbackChain = user.searchFallbackChain;
			if (user.extractFallbackChain) result.extractFallbackChain = user.extractFallbackChain;
			if (user.maxSearchResults) result.maxSearchResults = user.maxSearchResults;
			if (user.setupWizardComplete) result.setupWizardComplete = user.setupWizardComplete;

			// Deep merge for nested objects
			if (user.apiKeys) Object.assign(result.apiKeys, user.apiKeys);
			if (user.depth) {
				for (const level of ["quick", "standard", "deep"] as const) {
					if (user.depth?.[level]) Object.assign(result.depth[level], user.depth[level]);
				}
			}
			if (user.extraction) Object.assign(result.extraction, user.extraction);
			if (user.codeExecutionEnabled !== undefined) result.codeExecutionEnabled = user.codeExecutionEnabled;
		}
	} catch {
		// Parse error — return defaults
	}

	// Resolve API keys from env vars (config takes priority)
	for (const [name, envVar] of Object.entries(ENV_KEY_MAP)) {
		(result.apiKeys as Record<string, string>)[name] = resolveKey(
			(result.apiKeys as Record<string, string>)[name],
			envVar,
		);
	}

	return result;
}

/** Write the default config file (used by setup wizard). */
export function writeDefaultConfig(): string {
	const configPath = getConfigPath();
	const dir = path.dirname(configPath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

	const template = {
		// This file is auto-generated. Edit to customize.
		// API keys are auto-detected from environment variables.
		// Only override here if you want to force a specific key.
		// apiKeys: { brave: "" },

		preferredSearchProvider: "auto",
		searchFallbackChain: DEFAULTS.searchFallbackChain,
		extractFallbackChain: DEFAULTS.extractFallbackChain,
		setupWizardComplete: true,
	};

	fs.writeFileSync(configPath, JSON.stringify(template, null, 2) + "\n", { mode: 0o600 });
	return configPath;
}

/** Get the default config (for testing). */
export function getDefaults(): DeepResearchConfig {
	return JSON.parse(JSON.stringify(DEFAULTS));
}
