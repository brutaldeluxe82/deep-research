/**
 * deep_extract tool — content extraction from URLs with optional evidence tracking.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "../../config.ts";
import { registry } from "../../search/registry.ts";
import { recordExtractedSource, getCredibility } from "../../research/source-tracker.ts";

export function registerDeepExtract(pi: ExtensionAPI) {
	pi.registerTool({
		name: "deep_extract",
		label: "Deep Extract",
		description: [
			"Extract the main content from a web page URL.",
			"Uses Firecrawl (JS rendering), Exa, or native HTTP extraction based on available keys.",
			"Returns clean text suitable for LLM analysis with source metadata.",
			"Optionally pass goal/claim params to track evidence chains during research.",
		].join(" "),
		parameters: Type.Object({
			url: Type.String({ description: "URL of the web page to extract content from" }),
			goal: Type.Optional(Type.String({ description: "What specific information you're looking for (guides extraction focus)" })),
			claim: Type.Optional(Type.String({ description: "The claim this evidence supports (for evidence tracking)" })),
			sub_question_id: Type.Optional(Type.String({ description: "ID of the sub-question this relates to (e.g., sq-1)" })),
			max_tokens: Type.Optional(Type.Number({ description: "Max tokens to return (default: 8000)", default: 8000 })),
		}),

		async execute(_toolCallId, params) {
			const config = loadConfig();
			const url = params.url as string;
			const goal = (params.goal as string | undefined) ?? "";
			const claim = params.claim as string | undefined;
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
					details: {},
				};
			}

			// Track the source (dedup, session-scoped)
			recordExtractedSource(url, result.title ?? url, result.content?.slice(0, 200) ?? "");

			const credTier = getCredibility(url);

			let header = `# ${result.title}\nURL: ${result.url}${result.truncated ? " [TRUNCATED]" : ""}\n`;
			header += `Credibility: ${credTier}\n`;
			if (goal) header += `Goal: ${goal}\n`;
			if (claim) header += `Supports claim: "${claim}"\n`;
			header += `\n---\n\n`;

			let text = header + result.content;

			// If goal/claim provided, append evidence tracking prompt
			if (goal) {
				text += `\n\n---\n\n`;
				text += `**After reading the content above, record key evidence:**\n`;
				text += `For each finding, note:\n`;
				text += `- **Rational**: Why this evidence is relevant to the goal\n`;
				text += `- **Evidence**: The specific fact or data point\n`;
				text += `- **Summary**: One-sentence summary of the finding\n`;
			}

			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});
}
