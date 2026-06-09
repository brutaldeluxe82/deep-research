/**
 * research_report tool — generate final HTML + Markdown report.
 *
 * Takes structured data from the LLM and produces a self-contained
 * HTML report (dark/light mode, confidence gauge, TOC, source badges)
 * plus a Markdown version for terminal consumption.
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateHTMLReport, type ReportData } from "../../report/html.ts";
import { registry } from "../../search/registry.ts";

export function registerResearchReport(pi: ExtensionAPI) {
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
		}),

		async execute(_toolCallId, params) {
			const title = (params.title as string) ?? "Research Report";
			const query = (params.query as string) ?? "";
			const depth = (params.depth as string) ?? "quick";
			const rounds = (params.rounds as number) ?? 1;
			const confidence = (params.confidence as number) ?? 50;
			const executiveSummary = (params.executive_summary as string) ?? "";
			const sectionsRaw = params.sections ? JSON.parse(params.sections as string) : [];
			const sourcesRaw = params.sources ? JSON.parse(params.sources as string) : [];
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
				sources: sourcesRaw.map((s: any) => ({
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
			sourcesRaw.forEach((s: any, i: number) => {
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
}

/** Quick credibility tier from URL. */
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
