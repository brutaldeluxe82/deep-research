/**
 * research_outline tool — structured outline generation before writing.
 *
 * Takes sub-questions, key findings, and contradictions from the LLM
 * and generates a section-by-section outline for the report.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function registerResearchOutline(pi: ExtensionAPI) {
	pi.registerTool({
		name: "research_outline",
		label: "Research Outline",
		description: [
			"Generate a structured outline for the research report.",
			"Creates a structured outline: each section maps to a sub-question with source assignments.",
			"Use AFTER research_checkpoint returns 🟢 PROCEED, BEFORE writing the report.",
			"The outline guides section-by-section writing for coherent, evidence-backed reports.",
		].join(" "),
		parameters: Type.Object({
			title: Type.String({ description: "Report title" }),
			sub_questions: Type.String({ description: "JSON array of {id, question, status} objects for the research sub-questions" }),
			key_findings: Type.String({ description: "JSON array of key findings as {finding, sources, confidence} objects" }),
			contradictions: Type.Optional(Type.String({ description: "JSON array of contradictions as {claim, positions} objects" })),
		}),

		async execute(_toolCallId, params) {
			const title = (params.title as string) ?? "Report";
			const subQuestions = params.sub_questions ? JSON.parse(params.sub_questions as string) : [];
			const keyFindings = params.key_findings ? JSON.parse(params.key_findings as string) : [];
			const contradictions = params.contradictions ? JSON.parse(params.contradictions as string) : [];

			let text = `# Report Outline: ${title}\n\n`;
			text += `## 1. Executive Summary\n`;
			text += `   - Lead with the central conclusion\n`;
			text += `   - State confidence level and source coverage\n`;
			text += `   - Highlight the 3 most important findings\n\n`;

			// Map sub-questions to sections
			for (let i = 0; i < subQuestions.length; i++) {
				const sq = subQuestions[i];
				const sectionNum = i + 2; // Start at 2 (Executive Summary is section 1)
				text += `## ${sectionNum}. ${sq.question}\n`;
				text += `   Status: ${sq.status}\n`;

				// Assign relevant findings
				const relevantFindings = keyFindings.filter((f: any) =>
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
}
