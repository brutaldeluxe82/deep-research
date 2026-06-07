/**
 * Deep Research — main extension entry point.
 *
 * Registers pi tools:
 *   - deep_search:       Multi-provider parallel search (ParallelMuse)
 *   - deep_extract:      Goal-directed content extraction
 *   - deep_research:     Full iterative research pipeline init
 *   - research_checkpoint: Quality gate with confidence scoring
 *   - research_extract:  Goal-directed extraction with {rational, evidence, summary}
 *   - research_outline:  WebWeaver outline generation for report structure
 *   - research_report:   Generate final HTML+Markdown report
 *
 * Advanced features:
 *   - ParallelMuse: Fan-out search across N providers, converge + deduplicate
 *   - WebWeaver: Outline-then-write for structured report generation
 *   - Goal-directed extraction: LLM-driven extraction with evidence threading
 *   - 60+ source target for deep research
 *   - HTML report output with dark/light mode, confidence gauge, evidence chains
 *
 * Config lives at $PI_CODING_AGENT_DIR/deep-research.json
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { loadConfig, getConfigPath } from "../src/config.ts";
import { registerProviders } from "../src/search/index.ts";
import { registry } from "../src/search/registry.ts";
import { shouldRunWizard, runSetupWizard } from "../src/setup-wizard.ts";
import { getEngine, resetEngine } from "../src/research/engine.ts";
import type { SubQuestion, Evidence, SourceInfo, Contradiction } from "../src/research/engine.ts";
import { generateHTMLReport, type ReportData, type ReportSource, type ReportSection } from "../src/report/html.ts";

let currentCtx: ExtensionContext | undefined;

export default function (pi: ExtensionAPI) {
	// ── Session lifecycle ──────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		currentCtx = ctx;

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

		// Status
		const available = registry.listAvailableSearchProviders();
		const extractors = registry.listAvailableExtractors();
		ctx.ui.setStatus("deep-research", `${available.length} search providers, ${extractors.length} extractors`);
	});

	pi.on("session_shutdown", () => {
		currentCtx = undefined;
		resetEngine();
	});

	// ══════════════════════════════════════════════════════════════════════════
	// Tool: deep_search — ParallelMuse multi-provider search
	// ══════════════════════════════════════════════════════════════════════════

	pi.registerTool({
		name: "deep_search",
		label: "Deep Search",
		description: [
			"Search the web using ALL available providers in parallel (ParallelMuse pattern).",
			"Fans out queries across Brave, Exa, Tavily, Firecrawl, Synthetic, DuckDuckGo simultaneously.",
			"Results are deduplicated and merged — much higher source coverage than single-provider search.",
			"Returns ranked results with title, URL, snippet, source provider, and credibility tier.",
			"Pass multiple queries to fan out broadly across the topic.",
		].join(" "),
		parameters: Type.Object({
			query: Type.String({ description: "Search query (or comma-separated for multi-query fan-out)" }),
			max_results: Type.Optional(Type.Number({ description: "Max total results across all providers (default: 10, max: 20)", default: 10, maximum: 20 })),
			engine: Type.Optional(Type.String({ description: "Override engine: auto | brave | exa | tavily | firecrawl | duckduckgo | synthetic" })),
			parallel: Type.Optional(Type.Boolean({ description: "Search multiple providers in parallel (default: true)", default: true })),
		}) as never,

		async execute(_toolCallId, params) {
			const config = loadConfig();
			const rawQuery = params.query as string;
			const maxResults = Math.min((params.max_results as number) ?? 10, 20);
			const engineOverride = params.engine as string | undefined;
			const parallel = (params.parallel as boolean) ?? true;

			// Support comma-separated queries for fan-out
			const queries = rawQuery.split(",").map(q => q.trim()).filter(q => q.length > 0);

			const engine = getEngine(config);

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
					const triedStr = tried.length > 0 ? ` Tried: ${tried.join(", ")}` : "";
					return {
						content: [{ type: "text" as const, text: `No results found for "${queries[0]}".${triedStr}` }],
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

			// ParallelMuse: fan out across providers simultaneously
			const { results, providers } = await engine.parallelSearch(queries, maxResults);

			if (results.length === 0) {
				return {
					content: [{ type: "text" as const, text: `No results found for "${rawQuery}" across ${providers.length} providers.` }],
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

			text += `\n_Used ${providers.length} providers in parallel (ParallelMuse) — ${results.length} unique results after dedup._`;

			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});

	// ══════════════════════════════════════════════════════════════════════════
	// Tool: deep_extract — Content extraction
	// ══════════════════════════════════════════════════════════════════════════

	pi.registerTool({
		name: "deep_extract",
		label: "Deep Extract",
		description: [
			"Extract the main content from a web page URL.",
			"Uses Firecrawl (JS rendering), Exa, or native HTTP extraction based on available keys.",
			"Returns clean text suitable for LLM analysis with source metadata.",
			"For goal-directed extraction with evidence tracking, use research_extract instead.",
		].join(" "),
		parameters: Type.Object({
			url: Type.String({ description: "URL of the web page to extract content from" }),
			max_tokens: Type.Optional(Type.Number({ description: "Max tokens to return (default: 8000)", default: 8000 })),
		}) as never,

		async execute(_toolCallId, params) {
			const config = loadConfig();
			const url = params.url as string;
			const maxTokens = (params.max_tokens as number) ?? config.extraction.maxTokensPerPage;

			const result = await registry.extractWithFallback(
				url,
				config.extractFallbackChain,
				{ maxTokens },
			);

			if (!result) {
				return {
					content: [{ type: "text" as const, text: `Failed to extract content from ${url}` }],
					isError: true,
				};
			}

			const engine = getEngine(config);
			// Track source in the engine
			engine.goalDirectedExtract(url, "", maxTokens);

			const header = `# ${result.title}\nURL: ${result.url}${result.truncated ? " [TRUNCATED]" : ""}\n\n---\n\n`;
			return {
				content: [{ type: "text" as const, text: header + result.content }],
				details: {},
			};
		},
	});

	// ══════════════════════════════════════════════════════════════════════════
	// Tool: deep_research — Initialize research pipeline
	// ══════════════════════════════════════════════════════════════════════════

	pi.registerTool({
		name: "deep_research",
		label: "Deep Research",
		description: [
			"Run iterative deep research: multi-round parallel search, goal-directed extraction, confidence-gated synthesis.",
			"Uses ParallelMuse (multi-provider parallel search), WebWeaver (outline-then-write), and evidence threading.",
			"Set depth to 'quick' (2 rounds, 15 sources), 'standard' (6 rounds, 40 sources), or 'deep' (10 rounds, 60 sources).",
			"Returns research plan with sub-questions and search strategy.",
		].join(" "),
		parameters: Type.Object({
			query: Type.String({ description: "Research question or topic" }),
			depth: Type.Optional(Type.String({ description: "Research depth: quick | standard | deep", default: "standard" })),
		}) as never,

		async execute(_toolCallId, params) {
			const query = params.query as string;
			const depth = ((params.depth as string) ?? "standard") as "quick" | "standard" | "deep";
			const config = loadConfig();
			const engine = getEngine(config);
			resetEngine(); // Reset for new research run

			const freshEngine = getEngine(config);
			const plan = freshEngine.initPlan(query, depth);

			const available = registry.listAvailableSearchProviders().map(p => p.name);
			const extractors = registry.listAvailableExtractors().map(e => e.name);
			const target = { quick: 15, standard: 40, deep: 60 }[depth];

			const text = [
				`Starting deep research on: "${query}"`,
				`Category: ${plan.category}`,
				`Depth: ${depth} (${plan.roundsTotal} rounds, target ${target} sources)`,
				`Strategy: ParallelMuse (multi-provider parallel search) → goal-directed extraction → WebWeaver report`,
				`Search providers: ${available.join(", ")}`,
				`Extractors: ${extractors.join(", ")}`,
				`Config: ${getConfigPath()}`,
				``,
				`## Research Plan`,
				``,
				`1. Decompose the query into 3-6 sub-questions`,
				`2. For each round:`,
				`   - Generate diverse search queries for each sub-question`,
				`   - Fan out across ALL available providers simultaneously (ParallelMuse)`,
				`   - Extract content from top results with goal-directed extraction`,
				`   - Track evidence chains: claim → evidence → source`,
				`   - Call research_checkpoint after each round`,
				`3. When checkpoint returns 🟢, generate WebWeaver outline`,
				`4. Write report section by section using the outline`,
				`5. Generate HTML + Markdown report with research_report`,
				``,
				`Use deep_search for ParallelMuse search, deep_extract for content,`,
				`research_extract for goal-directed extraction with evidence tracking,`,
				`research_checkpoint after each round, and research_report for final output.`,
			].join("\n");

			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});

	// ══════════════════════════════════════════════════════════════════════════
	// Tool: research_checkpoint — Quality gate between rounds
	// ══════════════════════════════════════════════════════════════════════════

	pi.registerTool({
		name: "research_checkpoint",
		label: "Research Checkpoint",
		description: [
			"MUST call after each search round. Evaluates research progress and decides whether to continue.",
			"Returns RED (continue) or GREEN (proceed to report).",
			"Do NOT write the final report without a GREEN verdict.",
			"Provides specific guidance on what gaps to search for next.",
		].join(" "),
		parameters: Type.Object({
			depth: Type.String({ description: "Research depth: quick | standard | deep" }),
			round: Type.Number({ description: "Current round number (starting from 1)" }),
			sub_questions_answered: Type.Number({ description: "Number of sub-questions with sufficient evidence" }),
			total_sub_questions: Type.Number({ description: "Total number of sub-questions" }),
			total_sources: Type.Number({ description: "Unique sources found so far" }),
			confidence: Type.Number({ description: "Overall confidence 0-100" }),
			gaps: Type.String({ description: "Remaining information gaps" }),
		}) as never,

		async execute(_toolCallId, params) {
			const config = loadConfig();
			const depth = params.depth as string;
			const round = params.round as number;
			const answered = params.sub_questions_answered as number;
			const total = params.total_sub_questions as number;
			const sources = params.total_sources as number;
			const confidence = params.confidence as number;
			const gaps = params.gaps as string;

			const targetSources = { quick: 15, standard: 40, deep: 60 }[depth] ?? 40;
			const maxRounds = { quick: 2, standard: 6, deep: 10 }[depth] ?? 6;
			const minRounds = Math.max(2, maxRounds - 2);

			const engine = getEngine(config);
			engine.incrementRound();

			const answeredRatio = total > 0 ? answered / total : 0;
			const sourceRatio = sources / targetSources;

			// Decision logic
			let verdict: "🟢 PROCEED" | "🔴 CONTINUE";
			let reason: string;
			let nextAction = "";

			if (round < minRounds) {
				verdict = "🔴 CONTINUE";
				reason = `Only round ${round}/${maxRounds} — minimum ${minRounds} rounds required`;
				nextAction = `Keep searching. Target: ${targetSources} sources (currently: ${sources}). ${gaps || "Broaden queries and try different providers."}`;
			} else if (sourceRatio < 0.4 && round < maxRounds) {
				verdict = "🔴 CONTINUE";
				reason = `Only ${sources}/${targetSources} sources ( ${(sourceRatio * 100).toFixed(0)}%) — need more source coverage`;
				nextAction = gaps || `Fan out to more providers. Use diverse query phrasings. Target at least ${Math.ceil(targetSources * 0.7)} sources.`;
			} else if (confidence >= 75 && answeredRatio >= 0.7 && sourceRatio >= 0.5) {
				verdict = "🟢 PROCEED";
				reason = `Good confidence (${confidence}%), ${answered}/${total} questions answered, ${sources} sources found`;
			} else if (confidence < 40 && round < maxRounds) {
				verdict = "🔴 CONTINUE";
				reason = `Low confidence (${confidence}%) — need much more evidence`;
				nextAction = gaps || "Try entirely different search angles and providers. Consider extracting more content from existing results.";
			} else if (answeredRatio < 0.5 && round < maxRounds) {
				verdict = "🔴 CONTINUE";
				reason = `Only ${answered}/${total} sub-questions answered — major gaps remain`;
				nextAction = gaps || "Focus each search round on one unanswered sub-question at a time.";
			} else if (round >= maxRounds) {
				verdict = "🟢 PROCEED";
				reason = `Reached maximum rounds (${maxRounds}) — proceed with available evidence`;
			} else {
				verdict = "🟢 PROCEED";
				reason = `Sufficient evidence: ${confidence}% confidence, ${answered}/${total} questions, ${sources}/${targetSources} sources`;
			}

			const sourceProgress = `[${"█".repeat(Math.min(Math.round(sourceRatio * 20), 20))}${"░".repeat(20 - Math.min(Math.round(sourceRatio * 20), 20))}] ${sources}/${targetSources}`;

			let text = `${verdict}\n\n**${reason}**\n\n`;
			text += `Progress: Round ${round}/${maxRounds} | Confidence: ${confidence}% | Sources: ${sourceProgress} | Questions: ${answered}/${total}\n`;
			if (gaps) text += `\nGaps: ${gaps}\n`;
			if (nextAction) text += `\n📌 Next: ${nextAction}\n`;

			if (verdict === "🔴 CONTINUE") {
				text += `\n---\n`;
				text += `\n**Search strategy for next round:**`;
				text += `\n- Fan out across ALL available providers (ParallelMuse)`;
				text += `\n- Use diverse query phrasings: rephrase, specific, broad, "latest 2026"`;
				text += `\n- Extract deeper from the best results (don't just rely on snippets)`;
				text += `\n- Track evidence chains with research_extract for key claims`;
			}

			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});

	// ══════════════════════════════════════════════════════════════════════════
	// Tool: research_extract — Goal-directed extraction with evidence tracking
	// ══════════════════════════════════════════════════════════════════════════

	pi.registerTool({
		name: "research_extract",
		label: "Research Extract",
		description: [
			"Goal-directed content extraction with evidence tracking.",
			"Extracts content from a URL, then asks you to provide {rational, evidence, summary}",
			"for each key claim found — building an evidence chain: claim → evidence → source.",
			"Use this instead of deep_extract when doing structured research.",
			"Returns extracted content + source metadata for evidence threading.",
		].join(" "),
		parameters: Type.Object({
			url: Type.String({ description: "URL to extract content from" }),
			goal: Type.String({ description: "What specific information you're looking for from this page (guides extraction focus)" }),
			claim: Type.Optional(Type.String({ description: "The claim this evidence supports (for evidence threading)" })),
			sub_question_id: Type.Optional(Type.String({ description: "ID of the sub-question this evidence relates to (e.g., sq-1)" })),
			max_tokens: Type.Optional(Type.Number({ description: "Max tokens to return (default: 8000)", default: 8000 })),
		}) as never,

		async execute(_toolCallId, params) {
			const config = loadConfig();
			const url = params.url as string;
			const goal = params.goal as string;
			const claim = params.claim as string | undefined;
			const maxTokens = (params.max_tokens as number) ?? 8000;

			const engine = getEngine(config);
			const result = await engine.goalDirectedExtract(url, goal, maxTokens);

			if (!result) {
				return {
					content: [{ type: "text" as const, text: `Failed to extract content from ${url}` }],
					isError: true,
				};
			}

			const credTier = assessCredibilityQuick(url);

			let text = `# ${result.title}\n`;
			text += `URL: ${result.url}\n`;
			text += `Credibility: ${credTier}\n`;
			text += `Goal: ${goal}\n`;
			if (claim) text += `Supports claim: "${claim}"\n`;
			text += `\n---\n\n${result.content}\n\n---\n\n`;

			text += `**After reading the content above, record key evidence:**\n`;
			text += `For each finding, note:\n`;
			text += `- **Rational**: Why this evidence is relevant to the goal\n`;
			text += `- **Evidence**: The specific fact or data point\n`;
			text += `- **Summary**: One-sentence summary of the finding\n\n`;
			text += `Then call research_extract again for the next URL, or proceed to research_checkpoint.`;

			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});

	// ══════════════════════════════════════════════════════════════════════════
	// Tool: research_outline — WebWeaver outline generation
	// ══════════════════════════════════════════════════════════════════════════

	pi.registerTool({
		name: "research_outline",
		label: "Research Outline",
		description: [
			"Generate a WebWeaver-style outline for the research report.",
			"Creates a structured outline: each section maps to a sub-question with source assignments.",
			"Use AFTER research_checkpoint returns 🟢 PROCEED, BEFORE writing the report.",
			"The outline guides section-by-section writing for coherent, evidence-backed reports.",
		].join(" "),
		parameters: Type.Object({
			title: Type.String({ description: "Report title" }),
			sub_questions: Type.String({ description: "JSON array of {id, question, status} objects for the research sub-questions" }),
			key_findings: Type.String({ description: "JSON array of key findings as {finding, sources, confidence} objects" }),
			contradictions: Type.Optional(Type.String({ description: "JSON array of contradictions as {claim, positions} objects" })),
		}) as never,

		async execute(_toolCallId, params) {
			const title = params.title as string;
			const subQuestions = JSON.parse(params.sub_questions as string) as Array<{ id: string; question: string; status: string }>;
			const keyFindings = JSON.parse(params.key_findings as string) as Array<{ finding: string; sources: string[]; confidence: number }>;
			const contradictions = params.contradictions ? JSON.parse(params.contradictions as string) : [];

			let text = `# WebWeaver Outline: ${title}\n\n`;
			text += `## I. Executive Summary\n`;
			text += `   - Lead with the central conclusion\n`;
			text += `   - State confidence level and source coverage\n`;
			text += `   - Highlight the 3 most important findings\n\n`;

			// Map sub-questions to sections
			for (let i = 0; i < subQuestions.length; i++) {
				const sq = subQuestions[i];
				const sectionNum = String.fromCharCode(73 + i); // I, J, K...
				text += `## ${sectionNum}. ${sq.question}\n`;
				text += `   Status: ${sq.status}\n`;

				// Assign relevant findings
				const relevantFindings = keyFindings.filter(f =>
					f.finding.toLowerCase().includes(sq.question.toLowerCase().split(" ").slice(0, 3).join(" "))
				);
				if (relevantFindings.length > 0) {
					text += `   Key findings to include:\n`;
					for (const f of relevantFindings) {
						text += `   - ${f.finding} (confidence: ${f.confidence}%, sources: ${f.sources.length})\n`;
					}
				}
				text += `\n`;
			}

			// Add contradictions section
			if (contradictions.length > 0) {
				text += `## Contradictions & Nuances\n`;
				for (const c of contradictions) {
					text += `   - ${c.claim}\n`;
				}
				text += `\n`;
			}

			text += `## Conclusions\n`;
			text += `   - Clear answer to the original question\n`;
			text += `   - Confidence level with reasoning\n`;
			text += `   - Limitations and further research\n\n`;

			text += `---\n\n`;
			text += `**Next: Write each section using this outline. Use research_report to generate the final HTML report.**\n`;

			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});

	// ══════════════════════════════════════════════════════════════════════════
	// Tool: research_report — Generate final HTML + Markdown report
	// ══════════════════════════════════════════════════════════════════════════

	pi.registerTool({
		name: "research_report",
		label: "Research Report",
		description: [
			"Generate a beautiful, self-contained HTML research report + Markdown version.",
			"Features: dark/light mode, confidence gauge, evidence chains, source credibility badges,",
			"interactive table of contents, collapsible details, print-friendly layout.",
			"Call AFTER writing the report content — pass the structured data.",
			"Returns file paths for both HTML and Markdown versions.",
		].join(" "),
		parameters: Type.Object({
			title: Type.String({ description: "Report title" }),
			subtitle: Type.Optional(Type.String({ description: "Optional subtitle" })),
			query: Type.String({ description: "Original research query" }),
			depth: Type.String({ description: "Research depth used" }),
			rounds: Type.Number({ description: "Number of rounds completed" }),
			confidence: Type.Number({ description: "Final confidence score 0-100" }),
			executive_summary: Type.String({ description: "2-3 sentence executive summary" }),
			sections: Type.String({ description: "JSON array of {heading, level, content} report sections" }),
			sources: Type.String({ description: "JSON array of {title, url, date, credibility} source objects" }),
			contradictions: Type.Optional(Type.String({ description: "JSON array of {claim, positions} contradiction objects" })),
			filename: Type.Optional(Type.String({ description: "Output filename (without extension)" })),
		}) as never,

		async execute(_toolCallId, params) {
			const title = params.title as string;
			const query = params.query as string;
			const depth = params.depth as string;
			const rounds = params.rounds as number;
			const confidence = params.confidence as number;
			const executiveSummary = params.executive_summary as string;
			const sectionsRaw = JSON.parse(params.sections as string) as Array<{ heading: string; level: number; content: string }>;
			const sourcesRaw = JSON.parse(params.sources as string) as Array<{ title: string; url: string; date?: string; credibility?: string }>;
			const contradictionsRaw = params.contradictions
				? JSON.parse(params.contradictions as string)
				: [];
			const filename = (params.filename as string | undefined)
				?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

			// Build report data
			const reportData: ReportData = {
				title,
				subtitle: params.subtitle as string | undefined,
				query,
				depth,
				rounds,
				totalSources: sourcesRaw.length,
				confidence,
				executiveSummary,
				sections: sectionsRaw,
				sources: sourcesRaw.map(s => ({
					...s,
					credibility: (s.credibility as "tier-1" | "tier-2" | "tier-3") ?? assessCredibilityQuick(s.url) as "tier-1" | "tier-2" | "tier-3",
				})),
				contradictions: contradictionsRaw,
				generatedAt: new Date().toISOString(),
				searchProviders: registry.listAvailableSearchProviders().map(p => p.name),
			};

			// Generate HTML
			const html = generateHTMLReport(reportData);

			// Determine output directory
			const cwd = process.cwd();
			const htmlPath = path.join(cwd, `${filename}.html`);
			const mdPath = path.join(cwd, `${filename}.md`);

			// Write HTML
			fs.writeFileSync(htmlPath, html, "utf-8");

			// Write Markdown (construct from sections)
			let md = `# ${title}\n\n`;
			if (reportData.subtitle) md += `*${reportData.subtitle}*\n\n`;
			md += `**Research date:** ${reportData.generatedAt.split("T")[0]} | **Depth:** ${depth} | **Confidence:** ${confidence}% | **Sources:** ${sourcesRaw.length}\n\n`;
			md += `---\n\n`;
			md += `## Executive Summary\n\n${executiveSummary}\n\n`;

			for (const section of sectionsRaw) {
				const hashes = "#".repeat(Math.min(section.level, 6));
				md += `${hashes} ${section.heading}\n\n${section.content}\n\n`;
			}

			if (contradictionsRaw.length > 0) {
				md += `## Contradictions & Nuances\n\n`;
				for (const c of contradictionsRaw) {
					md += `### ⚠ ${c.claim}\n\n`;
					for (const p of c.positions) {
						md += `- **${p.source}**: ${p.position} — ${p.evidence}\n`;
					}
					md += `\n`;
				}
			}

			md += `## Sources\n\n`;
			md += `| # | Title | URL | Date | Credibility |\n`;
			md += `|---|-------|-----|------|-------------|\n`;
			sourcesRaw.forEach((s, i) => {
				md += `| ${i + 1} | ${s.title} | [link](${s.url}) | ${s.date ?? "—"} | ${s.credibility ?? "—"} |\n`;
			});

			md += `\n---\n\n*Generated by deep-research pi package — ${depth} depth, ${rounds} rounds, ${sourcesRaw.length} sources*\n`;

			fs.writeFileSync(mdPath, md, "utf-8");

			return {
				content: [{
					type: "text" as const,
					text: [
						`✅ Research report generated!`,
						``,
						`📄 HTML: ${htmlPath}`,
						`📝 Markdown: ${mdPath}`,
						``,
						`Stats: ${sourcesRaw.length} sources, ${confidence}% confidence, ${rounds} rounds`,
						`Size: ${(Buffer.byteLength(html) / 1024).toFixed(1)}KB HTML, ${(Buffer.byteLength(md) / 1024).toFixed(1)}KB Markdown`,
						``,
						`Open the HTML file in a browser for the full interactive report with:`,
						`- Dark/light mode support`,
						`- Confidence gauge`,
						`- Interactive table of contents`,
						`- Source credibility badges`,
						`- Evidence chain callouts`,
						`- Collapsible sections`,
						`- Print-friendly layout`,
					].join("\n"),
				}],
				details: {},
			};
		},
	});

	// ── Command: /research ─────────────────────────────────────────────────────

	try {
		pi.registerCommand("research", {
			description: "Start deep research on a topic",
			handler: async (args: string) => {
				const query = args.trim();
				if (!query) return;
				currentCtx?.ui.notify(`Research: ${query}`, "info");
			},
		});
	} catch { /* command registration may not be available */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
