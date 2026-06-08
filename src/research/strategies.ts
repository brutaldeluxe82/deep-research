/**
 * Research Strategy Templates
 *
 * Compensates for the lack of a custom-trained model by providing
 * structured guidance that helps general-purpose LLMs follow proven
 * research patterns — similar to what Alibaba's RL-trained model
 * does instinctively.
 *
 * Each strategy provides:
 * - systemPrompt: Additional guidance injected into the research context
 * - searchPatterns: Query mutation templates for diverse coverage
 * - evidenceThreshold: Minimum evidence per sub-question
 * - subQuestionTemplates: How to decompose queries for this strategy
 * - stopConditions: When to stop researching
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ResearchStrategy {
	/** Unique identifier. */
	name: string;

	/** One-line description of when to use this strategy. */
	description: string;

	/** Additional system prompt that guides the LLM's research approach. */
	systemPrompt: string;

	/** Query mutation templates. {Q} = original query, {Q_SHORT} = first 5 words. */
	searchPatterns: string[];

	/** Minimum evidence entries per sub-question to consider it "answered". */
	evidenceThreshold: number;

	/** Templates for decomposing the query into sub-questions. */
	subQuestionTemplates: string[];

	/** Conditions that indicate research should stop early. */
	stopConditions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Library
// ─────────────────────────────────────────────────────────────────────────────

export const STRATEGIES: Record<string, ResearchStrategy> = {
	comparison: {
		name: "comparison",
		description: "For X vs Y queries — search each option separately, then direct comparisons.",
		systemPrompt: [
			"This is a comparison research task. Follow this structured approach:",
			"1. Research EACH option independently before comparing them.",
			"2. For each option, find: key features, strengths, weaknesses, pricing, use cases.",
			"3. After researching options separately, search for direct head-to-head comparisons.",
			"4. Create a comparison matrix early and fill it in as evidence arrives.",
			"5. Be explicit about trade-offs — no option is universally better.",
			"6. Present a verdict only after all options have equal evidence coverage.",
		].join("\n"),
		searchPatterns: [
			"{Q}",
			"{Q} review pros cons",
			"{Q} comparison versus alternatives",
			"{Q_SHORT} best use cases",
			"{Q_SHORT} pricing features 2026",
		],
		evidenceThreshold: 3,
		subQuestionTemplates: [
			"What are the key features of each option in: {Q}?",
			"What are the strengths and weaknesses of each option?",
			"What do direct comparisons say about: {Q}?",
			"What are the pricing and licensing differences?",
			"What are the best use cases for each option?",
		],
		stopConditions: [
			"Each option has at least 3 evidence entries",
			"At least 2 direct comparison sources found",
			"All sub-questions answered",
		],
	},

	factcheck: {
		name: "factcheck",
		description: "For verifying claims — search supporting evidence, contradicting evidence, and academic sources.",
		systemPrompt: [
			"This is a fact-checking research task. Follow this structured approach:",
			"1. First, clearly state the claim being checked.",
			"2. Search for EVIDENCE SUPPORTING the claim.",
			"3. Search for EVIDENCE CONTRADICTING the claim (debunking, counter-arguments).",
			"4. Search for ACADEMIC or authoritative sources on the topic.",
			"5. Do NOT form a conclusion until you have both supporting and contradicting evidence.",
			"6. Clearly label evidence as 'supporting', 'contradicting', or 'neutral'.",
			"7. Give a verdict (True / False / Partially True / Unsubstantiated) with confidence level.",
		].join("\n"),
		searchPatterns: [
			"{Q}",
			"evidence for {Q}",
			"{Q} debunked myth",
			"{Q} scientific study research",
			"fact check {Q}",
		],
		evidenceThreshold: 2,
		subQuestionTemplates: [
			"What is the exact claim being made in: {Q}?",
			"What evidence supports this claim?",
			"What evidence contradicts or debunks this claim?",
			"What do authoritative sources (academic, government) say?",
			"Is there a scientific consensus on this topic?",
		],
		stopConditions: [
			"At least 2 supporting evidence entries",
			"At least 2 contradicting evidence entries",
			"At least 1 academic/authoritative source",
			"Verdict can be stated with confidence > 60%",
		],
	},

	deep_dive: {
		name: "deep_dive",
		description: "For explain X queries — overview, then technical depth, then edge cases.",
		systemPrompt: [
			"This is a deep-dive research task. Follow this structured approach:",
			"1. Start with a BROAD OVERVIEW of the topic (what, why, who).",
			"2. Then go DEEPER into technical details, mechanisms, and inner workings.",
			"3. Then explore EDGE CASES, limitations, and lesser-known aspects.",
			"4. Each sub-question should build on the previous one — go progressively deeper.",
			"5. Include practical examples and real-world applications.",
			"6. Cover the topic from multiple angles: technical, business, social impact.",
			"7. Don't stop at surface level — the goal is thorough understanding.",
		].join("\n"),
		searchPatterns: [
			"{Q}",
			"{Q} overview introduction guide",
			"{Q} technical details how it works",
			"{Q} advanced deep dive internals",
			"{Q} edge cases limitations challenges",
			"{Q} real world examples applications",
		],
		evidenceThreshold: 5,
		subQuestionTemplates: [
			"What is {Q}? (Overview and definition)",
			"How does {Q} work technically? (Mechanisms and internals)",
			"What are the key applications and use cases of {Q}?",
			"What are the limitations and challenges of {Q}?",
			"What does the future hold for {Q}? (Trends and developments)",
		],
		stopConditions: [
			"At least 5 evidence entries per sub-question",
			"Both overview and technical depth covered",
			"Edge cases and limitations addressed",
			"At least 3 different source domains",
		],
	},

	exploratory: {
		name: "exploratory",
		description: "For open-ended queries — broad search, then narrow based on findings.",
		systemPrompt: [
			"This is an exploratory research task. Follow this structured approach:",
			"1. Start BROAD — cast a wide net with diverse queries.",
			"2. After initial results, IDENTIFY the most promising directions.",
			"3. Then NARROW — focus search on the most relevant sub-topics.",
			"4. Be prepared to pivot — if initial assumptions are wrong, adjust.",
			"5. Map the landscape first, then fill in details.",
			"6. Look for unexpected connections and emerging patterns.",
			"7. Don't lock into a single framing too early.",
		].join("\n"),
		searchPatterns: [
			"{Q}",
			"{Q} overview landscape",
			"{Q} trends recent developments",
			"{Q} expert analysis opinion",
			"what is important about {Q_SHORT}",
		],
		evidenceThreshold: 3,
		subQuestionTemplates: [
			"What is the current state of: {Q}?",
			"What are the key aspects or dimensions of: {Q}?",
			"What are the latest developments in: {Q}?",
			"What do experts say about: {Q}?",
			"What are the open questions or unknowns about: {Q}?",
		],
		stopConditions: [
			"At least 3 evidence entries per sub-question",
			"Multiple perspectives covered",
			"No major gaps in the landscape map",
			"Sources from at least 3 different domains",
		],
	},

	temporal: {
		name: "temporal",
		description: "For latest X or history of X — search chronologically with recency filters.",
		systemPrompt: [
			"This is a temporal research task. Follow this structured approach:",
			"1. START with the most recent information (use recency filters).",
			"2. Then work BACKWARDS to understand how we got here.",
			"3. Identify key milestones, turning points, and timeline events.",
			"4. Distinguish between historical facts and recent developments.",
			"5. Note when things changed and WHY they changed.",
			"6. If the query asks for 'latest', prioritize results from the last 6 months.",
			"7. Create a chronological narrative, not just a list of facts.",
		].join("\n"),
		searchPatterns: [
			"{Q}",
			"{Q} latest news 2026",
			"{Q} recent developments updates",
			"{Q} history timeline evolution",
			"{Q} milestones key events",
		],
		evidenceThreshold: 2,
		subQuestionTemplates: [
			"What is the current state of: {Q}? (Most recent)",
			"What happened in the last year regarding: {Q}?",
			"What are the key historical milestones for: {Q}?",
			"What caused the major changes in: {Q}?",
			"What is the trajectory and future outlook for: {Q}?",
		],
		stopConditions: [
			"At least 2 evidence entries per time period covered",
			"Both recent and historical sources present",
			"Key milestones identified and dated",
			"Current state clearly established",
		],
	},
};

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Map query categories (from classifyQuery) to strategy names. */
const CATEGORY_STRATEGY_MAP: Record<string, string> = {
	comparison: "comparison",
	factcheck: "factcheck",
	definition: "deep_dive",
	howto: "deep_dive",
	product: "comparison",
	general: "exploratory",
};

/** Resolve the best strategy for a query. */
export function resolveStrategy(query: string, category: string): ResearchStrategy {
	// Check for temporal keywords first
	const q = query.toLowerCase();
	const temporalSignals = [
		/latest/i, /recent/i, /history of/i, /timeline/i, /evolution of/i,
		/changelog/i, /what happened/i, /upcoming/i, /roadmap/i,
		/in 202[0-9]/i, /new in/i, /changes in/i,
	];

	if (temporalSignals.some(r => r.test(q))) {
		return STRATEGIES.temporal;
	}

	// Check for fact-check signals
	const factcheckSignals = [
		/is it true/i, /myth/i, /debunk/i, /fact check/i, /really/i,
		/verify/i, /legitimate/i, /scam/i, /hoax/i, /misinformation/i,
	];

	if (factcheckSignals.some(r => r.test(q))) {
		return STRATEGIES.factcheck;
	}

	// Otherwise, map category to strategy
	const strategyName = CATEGORY_STRATEGY_MAP[category] ?? "exploratory";
	return STRATEGIES[strategyName] ?? STRATEGIES.exploratory;
}

/** Map a query category to a strategy name. Alias used by engine.ts. */
export function categoryToStrategy(category: string): string {
	return CATEGORY_STRATEGY_MAP[category] ?? "exploratory";
}

/** Get a strategy by name (for manual override). */
export function getStrategyByName(name: string): ResearchStrategy | undefined {
	return STRATEGIES[name];
}

/** List all available strategy names. */
export function listStrategies(): string[] {
	return Object.keys(STRATEGIES);
}

/** Alias for listStrategies — used by extensions. */
export const listStrategyNames = listStrategies;
