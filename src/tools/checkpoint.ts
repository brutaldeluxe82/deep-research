/**
 * research_checkpoint tool — quality gate between search rounds.
 *
 * Evaluates research progress and returns RED (continue) or GREEN (proceed to report).
 * The host LLM decides what to do with the verdict; we just compute it.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { incrementRound } from "../../research/round-tracker.ts";

export function registerResearchCheckpoint(pi: ExtensionAPI) {
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
		}),

		async execute(_toolCallId, params) {
			const depth = (params.depth as string) ?? "quick";
			const round = (params.round as number) ?? 1;
			const answered = (params.sub_questions_answered as number) ?? 0;
			const total = (params.total_sub_questions as number) ?? 1;
			const sources = (params.total_sources as number) ?? 0;
			const confidence = (params.confidence as number) ?? 50;
			const gaps = (params.gaps as string) ?? "";

			const targetSources = { quick: 15, standard: 40, deep: 60 }[depth] ?? 40;
			const maxRounds = { quick: 2, standard: 6, deep: 10 }[depth] ?? 6;
			const minRounds = Math.max(2, maxRounds - 2);

			incrementRound();

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
				reason = `Only ${sources}/${targetSources} sources (${(sourceRatio * 100).toFixed(0)}%) — need more source coverage`;
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
				text += `\n- Fan out across all available providers in parallel`;
				text += `\n- Use diverse query phrasings: rephrase, specific, broad, "latest 2026"`;
				text += `\n- Extract deeper from the best results (don't just rely on snippets)`;
				text += `\n- Track evidence chains with deep_extract (pass goal/claim params) for key claims`;
			}

			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});
}
