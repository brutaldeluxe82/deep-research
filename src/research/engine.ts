/**
 * Research Engine — Iterative deep research pipeline.
 *
 * Implements:
 * - Multi-provider parallel search with URL dedup
 * - Goal-directed extraction with evidence tracking
 * - Multi-query fan-out: Generate N sub-queries, search all in parallel
 * - Confidence scoring with evidence threading
 *
 * The engine provides structured data for the HTML report generator.
 */

import type { SearchResult } from "../search/types.ts";
import { registry } from "../search/registry.ts";
import { loadConfig, type DeepResearchConfig } from "../config.ts";
import { getStrategyByName, categoryToStrategy, type ResearchStrategy } from "./strategies.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SubQuestion {
	id: string;
	question: string;
	status: "open" | "partial" | "answered";
	evidence: Evidence[];
	searchQueries: string[];
}

export interface Evidence {
	claim: string;
	source: SourceInfo;
	rational: string;      // Why this evidence is relevant
	confidence: number;    // 0-100 how well this supports the claim
	extractedAt: string;
}

export interface SourceInfo {
	title: string;
	url: string;
	date?: string;
	credibility: "tier-1" | "tier-2" | "tier-3";
	snippet?: string;
	fullContent?: string;
	extractedFrom?: string; // Search provider that found it
}

export interface Contradiction {
	claim: string;
	positions: {
		source: string;
		position: string;
		evidence: string;
	}[];
}

export interface ResearchPlan {
	query: string;
	category: string;
	subQuestions: SubQuestion[];
	depth: "quick" | "standard" | "deep";
	roundsCompleted: number;
	roundsTotal: number;
	sourcesFound: SourceInfo[];
	contradictions: Contradiction[];
	startedAt: string;
}

export interface ResearchRoundResult {
	queries: string[];
	provider: string;
	searchResults: SearchResult[];
	extractedUrls: string[];
	newEvidence: Evidence[];
	sourcesAdded: number;
	totalUniqueSources: number;
}

export interface ResearchResult {
	plan: ResearchPlan;
	evidence: Evidence[];
	sources: SourceInfo[];
	contradictions: Contradiction[];
	confidence: number;
	roundsCompleted: number;
	totalSearchResults: number;
	durationMs: number;
	searchProvidersUsed: string[];
}

export type { ResearchStrategy };

// ─────────────────────────────────────────────────────────────────────────────
// Config overrides for high-source-count research
// ─────────────────────────────────────────────────────────────────────────────

const DEPTH_SOURCE_TARGETS: Record<string, { rounds: number; sources: number; queriesPerRound: number; extractPerRound: number }> = {
	quick:    { rounds: 2,  sources: 15, queriesPerRound: 4, extractPerRound: 6 },
	standard: { rounds: 6,  sources: 40, queriesPerRound: 5, extractPerRound: 8 },
	deep:     { rounds: 10, sources: 60, queriesPerRound: 6, extractPerRound: 10 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Research Engine
// ─────────────────────────────────────────────────────────────────────────────

export class ResearchEngine {
	private config: DeepResearchConfig;
	private plan!: ResearchPlan;
	private evidence: Evidence[] = [];
	private sources: SourceInfo[] = [];
	private urlIndex = new Set<string>();
	private contradictions: Contradiction[] = [];
	private providersUsed = new Set<string>();
	private totalSearchResults = 0;
	private startTime = 0;
	private _strategyName?: string; // Override strategy name

	constructor(config?: DeepResearchConfig) {
		this.config = config ?? loadConfig();
	}

	/**
	 * Initialize a research plan by decomposing the query into sub-questions.
	 * This is Phase 1 — the LLM should handle this inline.
	 */
	initPlan(query: string, depth: "quick" | "standard" | "deep"): ResearchPlan {
		this.startTime = Date.now();
		const target = DEPTH_SOURCE_TARGETS[depth];

		this.plan = {
			query,
			category: classifyQuery(query),
			subQuestions: [],
			depth,
			roundsCompleted: 0,
			roundsTotal: target.rounds,
			sourcesFound: [],
			contradictions: [],
			startedAt: new Date().toISOString(),
		};

		return this.plan;
	}

	/**
	 * Register a sub-question (called by the LLM during Phase 1 planning).
	 */
	addSubQuestion(question: string): SubQuestion {
		const sq: SubQuestion = {
			id: `sq-${this.plan.subQuestions.length + 1}`,
			question,
			status: "open",
			evidence: [],
			searchQueries: [],
		};
		this.plan.subQuestions.push(sq);
		return sq;
	}

	/**
	 * Generate diverse search queries for a sub-question.
	 * Uses query mutation: original, rephrased, specific, broad.
	 */
	generateQueries(subQuestion: string, round: number): string[] {
		const queries: string[] = [];
		const base = subQuestion;

		// Round 0: direct query
		queries.push(base);

		// Round 0+: rephrased
		if (round > 0) {
			queries.push(`${base} latest 2026`);
			queries.push(`${base} analysis comparison`);
		}

		// Always add specific variants
		queries.push(`what is the best ${base}`);
		queries.push(`${base} expert opinion research`);

		const depth = this.plan?.depth ?? "standard";
		return [...new Set(queries)].slice(0, DEPTH_SOURCE_TARGETS[depth].queriesPerRound);
	}

	/**
	 * Search across all available providers simultaneously.
	 * Each provider gets the query, results are merged and deduplicated.
	 *
	 * Uses ALL available providers, not just top 3.
	 * More providers don't add latency — they're parallel — just more results.
	 * Providers are sorted by health score (S6.7): healthy ones run first
	 * in case we need results before the slow ones finish.
	 */
	async parallelSearch(
		queries: string[],
		maxResults: number = 10,
	): Promise<{ results: SearchResult[]; providers: string[] }> {
		const config = this.config;
		const chain = config.searchFallbackChain.filter(p => {
			const provider = registry.getSearchProvider(p);
			return provider?.isAvailable();
		});

		// Sort chain by health score — healthy providers first
		const sortedChain = [...chain].sort((a, b) => {
			return ProviderHealth.getHealth(b) - ProviderHealth.getHealth(a);
		});

		// Fan out queries across all available providers
		const allResults = new Map<string, SearchResult>();
		const providersUsed = new Set<string>();

		// Create search tasks: each query × each provider
		const tasks: Promise<void>[] = [];

		for (const query of queries) {
			for (const providerName of sortedChain) { // ALL providers, not just top 3
				tasks.push((async () => {
					try {
						const provider = registry.getSearchProvider(providerName);
						if (!provider?.isAvailable()) return;

						const startTime = Date.now();
						const results = await provider.search(query, { maxResults });
						const elapsed = Date.now() - startTime;

						// Track provider health
						if (results.length > 0) {
							ProviderHealth.recordSuccess(providerName, elapsed);
							providersUsed.add(providerName);
						} else if (elapsed < 2000) {
							// Fast empty response = likely API issue, not timeout
							ProviderHealth.recordFailure(providerName);
						}
						// Slow empty = probable timeout, don't penalize too harshly

						for (const r of results) {
							const key = normalizeUrl(r.url);
							if (!allResults.has(key)) {
								allResults.set(key, { ...r, source: providerName });
							}
						}
					} catch {
						// Provider failed for this query — record failure and continue
						ProviderHealth.recordFailure(providerName);
					}
				})());
			}
		}

		await Promise.allSettled(tasks);

		// Deduplicate by URL, sort by score/date if available
		const results = [...allResults.values()]
			.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
			.slice(0, maxResults);

		this.totalSearchResults += results.length;
		for (const p of providersUsed) this.providersUsed.add(p);

		return { results, providers: [...providersUsed] };
	}

	/**
	 * Goal-directed extraction: Extract content from URL with structured goal.
	 */
	async goalDirectedExtract(
		url: string,
		goal: string,
		maxTokens: number = 8000,
	): Promise<{ content: string; title: string; url: string } | null> {
		try {
			const result = await registry.extractWithFallback(
				url,
				this.config.extractFallbackChain,
				{ maxTokens, format: "markdown" },
			);

			if (!result || result.content.length < 50) return null;

			// Track the source
			const source: SourceInfo = {
				title: result.title,
				url: result.url,
				credibility: assessCredibility(result.url),
				snippet: result.content.slice(0, 200).trim(),
				fullContent: result.content,
				extractedFrom: this.config.extractFallbackChain[0],
			};

			const normalizedUrl = normalizeUrl(url);
			if (!this.urlIndex.has(normalizedUrl)) {
				this.urlIndex.add(normalizedUrl);
				this.sources.push(source);
				this.plan.sourcesFound.push(source);
			}

			return { content: result.content, title: result.title, url: result.url };
		} catch {
			return null;
		}
	}

	/**
	 * Record evidence found from extraction.
	 */
	addEvidence(evidence: Evidence): void {
		this.evidence.push(evidence);
		// Update sub-question status
		for (const sq of this.plan.subQuestions) {
			if (evidence.claim.toLowerCase().includes(sq.question.toLowerCase().split(" ").slice(0, 3).join(" "))) {
				sq.evidence.push(evidence);
				sq.status = sq.evidence.length >= 2 ? "answered" : "partial";
			}
		}
	}

	/**
	 * Record a contradiction between sources.
	 */
	addContradiction(contradiction: Contradiction): void {
		this.contradictions.push(contradiction);
		this.plan.contradictions.push(contradiction);
	}

	/**
	 * Calculate overall research confidence based on evidence and source counts.
	 */
	calculateConfidence(): number {
		if (this.sources.length === 0) return 0;

		let confidence = 0;

		// Source count score (up to 40 points)
		const sourceScore = Math.min(this.sources.length / 10, 1) * 40;
		confidence += sourceScore;

		// Convergence score: evidence agreeing (up to 30 points)
		const uniqueUrls = new Set(this.evidence.map(e => e.source.url));
		const convergenceRatio = uniqueUrls.size > 0
			? Math.min(uniqueUrls.size / this.sources.length, 1)
			: 0;
		confidence += convergenceRatio * 30;

		// Sub-question coverage (up to 30 points)
		const answeredCount = this.plan.subQuestions.filter(
			sq => sq.status === "answered"
		).length;
		const partialCount = this.plan.subQuestions.filter(
			sq => sq.status === "partial"
		).length;
		const totalSQ = this.plan.subQuestions.length || 1;
		const coverageRatio = (answeredCount + partialCount * 0.5) / totalSQ;
		confidence += coverageRatio * 30;

		return Math.round(Math.min(confidence, 100));
	}

	/**
	 * Get the final research result for report generation.
	 */
	getResult(): ResearchResult {
		return {
			plan: this.plan,
			evidence: this.evidence,
			sources: this.sources,
			contradictions: this.contradictions,
			confidence: this.calculateConfidence(),
			roundsCompleted: this.plan.roundsCompleted,
			totalSearchResults: this.totalSearchResults,
			durationMs: Date.now() - this.startTime,
			searchProvidersUsed: [...this.providersUsed],
		};
	}

	/**
	 * Generate the report outline from research results.
	 * Produces a structured outline with sections mapping to sub-questions.
	 */
	generateOutline(): { sections: Array<{ heading: string; subQuestions: string[]; sources: SourceInfo[] }> } {
		const sections = this.plan.subQuestions.map(sq => ({
			heading: sq.question,
			subQuestions: [sq.question],
			sources: this.sources.filter(s =>
				sq.evidence.some(e => normalizeUrl(e.source.url) === normalizeUrl(s.url))
			),
		}));

		return { sections };
	}

	/**
	 * Increment round counter. Safe to call even without an initialized plan.
	 */
	incrementRound(): number {
		if (!this.plan) return 0;
		this.plan.roundsCompleted++;
		return this.plan.roundsCompleted;
	}

	/**
	 * Get the research strategy appropriate for the current query's category.
	 */
	getStrategy(): ResearchStrategy {
		if (!this.plan) return getStrategyByName("exploratory")!;
		const strategyName = categoryToStrategy(this.plan.category);
		return getStrategyByName(strategyName) ?? getStrategyByName("exploratory")!;
	}

	/**
	 * Get the source target for the current depth.
	 */
	getSourceTarget(): number {
		const depth = this.plan?.depth ?? "standard";
		return DEPTH_SOURCE_TARGETS[depth].sources;
	}

	/**
	 * Get queries per round for the current depth.
	 */
	getQueriesPerRound(): number {
		const depth = this.plan?.depth ?? "standard";
		return DEPTH_SOURCE_TARGETS[depth].queriesPerRound;
	}

	/**
	 * Get extracts per round for the current depth.
	 */
	getExtractPerRound(): number {
		const depth = this.plan?.depth ?? "standard";
		return DEPTH_SOURCE_TARGETS[depth].extractPerRound;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Classify a research query into a category for search strategy. */
function classifyQuery(query: string): string {
	const q = query.toLowerCase();
	if (/vs|versus|compare|better|best/i.test(q)) return "comparison";
	if (/how to|how do|guide|tutorial|setup|install/i.test(q)) return "howto";
	if (/what is|define|explain|meaning/i.test(q)) return "definition";
	if (/fact|true|false| myths?|debunk/i.test(q)) return "factcheck";
	if (/price|cost|afford|buy|review/i.test(q)) return "product";
	if (/latest|recent|new|current|update|news|2024|2025|2026|history|timeline|chronology/i.test(q)) return "temporal";
	return "general";
}

/** Normalize a URL for deduplication. */
function normalizeUrl(url: string): string {
	try {
		const u = new URL(url);
		// Remove trailing slash, www., tracking params
		let normalized = u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
		// Remove common tracking params
		const cleanParams = new URLSearchParams();
		for (const [k, v] of u.searchParams) {
			if (!["utm_source", "utm_medium", "utm_campaign", "ref", "fbclid", "gclid"].includes(k)) {
				cleanParams.set(k, v);
			}
		}
		if (cleanParams.toString()) normalized += "?" + cleanParams.toString();
		return normalized.toLowerCase();
	} catch {
		return url.toLowerCase();
	}
}

/** Assess source credibility based on URL heuristics. */
function assessCredibility(url: string): "tier-1" | "tier-2" | "tier-3" {
	try {
		const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

		// Tier 1: Academic, government, major outlets
		const tier1 = [
			"arxiv.org", "nature.com", "science.org", "doi.org", "pubmed.ncbi",
			"acm.org", "ieee.org", "springer.com", "wiley.com",
			"gov", "edu", "nist.gov", "nist.org",
			"reuters.com", "apnews.com", "bbc.com", "nytimes.com",
			"deepmind.google", "openai.com", "anthropic.com",
		];
		if (tier1.some(t => host.endsWith(t) || host.includes(t))) return "tier-1";

		// Tier 2: Established tech publications, documentation
		const tier2 = [
			"github.com", "stackoverflow.com", "mdn.io", "developer.mozilla.org",
			"medium.com", "towardsdatascience.com", "hbr.org",
			"techcrunch.com", "theverge.com", "arstechnica.com",
			"wired.com", "venturebeat.com", "thenewstack.io",
			"docs.", "documentation", "wiki",
		];
		if (tier2.some(t => host.includes(t))) return "tier-2";

		return "tier-3";
	} catch {
		return "tier-3";
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Health Tracking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks per-session provider health. If a provider fails repeatedly,
 * it gets deprioritized in the fallback chain.
 *
 * Health score: 0-100. Starts at 100 (healthy). Each failure reduces it.
 * Successes slowly restore it. Score affects chain ordering, not availability.
 */
export class ProviderHealth {
	private static stats = new Map<string, { successes: number; failures: number; lastFailureAt: number; avgLatencyMs: number }>();

	/** Record a successful search. */
	static recordSuccess(provider: string, latencyMs: number): void {
		const s = ProviderHealth.stats.get(provider) ?? { successes: 0, failures: 0, lastFailureAt: 0, avgLatencyMs: 0 };
		s.successes++;
		s.avgLatencyMs = s.avgLatencyMs === 0 ? latencyMs : Math.round((s.avgLatencyMs * 0.8) + (latencyMs * 0.2));
		ProviderHealth.stats.set(provider, s);
	}

	/** Record a failed search. */
	static recordFailure(provider: string): void {
		const s = ProviderHealth.stats.get(provider) ?? { successes: 0, failures: 0, lastFailureAt: 0, avgLatencyMs: 0 };
		s.failures++;
		s.lastFailureAt = Date.now();
		ProviderHealth.stats.set(provider, s);
	}

	/** Get health score 0-100. 100=perfect, lower=unreliable. */
	static getHealth(provider: string): number {
		const s = ProviderHealth.stats.get(provider);
		if (!s) return 100; // No data = assume healthy
		if (s.successes === 0 && s.failures === 0) return 100;

		// Recent failures (last 5 min) count double
		const recentPenalty = (Date.now() - s.lastFailureAt < 300000 && s.failures > 0) ? s.failures : 0;
		const totalPenalty = s.failures + recentPenalty;

		return Math.max(0, 100 - (totalPenalty * 10));
	}

	/** Get health summary for status/debug. */
	static getSummary(): Record<string, { health: number; successes: number; failures: number; avgLatencyMs: number }> {
		const result: Record<string, { health: number; successes: number; failures: number; avgLatencyMs: number }> = {};
		for (const [provider, s] of ProviderHealth.stats) {
			result[provider] = { health: ProviderHealth.getHealth(provider), ...s };
		}
		return result;
	}

	/** Reset all health data (e.g. on new session). */
	static reset(): void {
		ProviderHealth.stats.clear();
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton engine instance per session
// ─────────────────────────────────────────────────────────────────────────────

let engineInstance: ResearchEngine | undefined;

export function getEngine(config?: DeepResearchConfig): ResearchEngine {
	if (!engineInstance) {
		engineInstance = new ResearchEngine(config);
	}
	return engineInstance;
}

export function resetEngine(): void {
	engineInstance = undefined;
	ProviderHealth.reset();
}
