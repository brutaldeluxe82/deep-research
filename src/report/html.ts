/**
 * HTML Report Generator
 *
 * Generates beautiful, self-contained HTML research reports with:
 * - Responsive design, dark/light mode
 * - Collapsible sections
 * - Source credibility badges
 * - Evidence threading (claim → evidence → source)
 * - Print-friendly layout
 * - Interactive table of contents
 * - Confidence gauge
 */

export interface ReportSource {
	title: string;
	url: string;
	date?: string;
	credibility?: "tier-1" | "tier-2" | "tier-3";
	snippet?: string;
}

export interface ReportSection {
	heading: string;
	level: number;  // 1-6
	content: string; // markdown or HTML
	subsections?: ReportSection[];
}

export interface ReportData {
	title: string;
	subtitle?: string;
	query: string;
	depth: string;
	rounds: number;
	totalSources: number;
	confidence: number;
	executiveSummary: string;
	sections: ReportSection[];
	sources: ReportSource[];
	contradictions?: { claim: string; positions: { source: string; position: string; evidence: string }[] }[];
	generatedAt: string;
	duration?: string;
	searchProviders: string[];
}

export function generateHTMLReport(data: ReportData): string {
	const toc = generateTOC(data.sections);
	const sectionsHtml = data.sections.map(renderSection).join("\n");
	const sourcesTable = renderSourcesTable(data.sources);
	const contradictionsHtml = data.contradictions?.length
		? renderContradictions(data.contradictions)
		: "";
	const confidenceColor = data.confidence >= 80 ? "#22c55e" : data.confidence >= 50 ? "#eab308" : "#ef4444";

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(data.title)} — Deep Research Report</title>
<style>
:root {
	--bg: #0f172a; --surface: #1e293b; --surface-2: #334155;
	--border: #475569; --text: #e2e8f0; --text-muted: #94a3b8;
	--accent: #3b82f6; --accent-light: #60a5fa;
	--green: #22c55e; --yellow: #eab308; --red: #ef4444;
	--tier1: #3b82f6; --tier2: #8b5cf6; --tier3: #6b7280;
}
@media (prefers-color-scheme: light) {
	:root {
		--bg: #ffffff; --surface: #f8fafc; --surface-2: #f1f5f9;
		--border: #e2e8f0; --text: #0f172a; --text-muted: #64748b;
		--accent: #2563eb; --accent-light: #3b82f6;
	}
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
	background: var(--bg); color: var(--text); line-height: 1.7; font-size: 16px;
}
.container { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }

/* ── Header ─────────────────────────────────── */
.report-header {
	padding: 3rem 0 2rem; border-bottom: 1px solid var(--border);
	margin-bottom: 2rem;
}
.report-header h1 {
	font-size: 2.2rem; font-weight: 800; letter-spacing: -0.02em;
	background: linear-gradient(135deg, var(--accent), var(--accent-light));
	-webkit-background-clip: text; -webkit-text-fill-color: transparent;
	background-clip: text; margin-bottom: 0.5rem;
}
.report-header .subtitle { color: var(--text-muted); font-size: 1.1rem; margin-bottom: 1.5rem; }

/* ── Metadata grid ──────────────────────────── */
.meta-grid {
	display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
	gap: 0.75rem; margin: 1.5rem 0;
}
.meta-card {
	background: var(--surface); border: 1px solid var(--border);
	border-radius: 10px; padding: 1rem; text-align: center;
}
.meta-card .value { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
.meta-card .label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

/* ── Confidence gauge ───────────────────────── */
.confidence-ring {
	width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 0.5rem;
	background: conic-gradient(${confidenceColor} ${data.confidence * 3.6}deg, var(--surface-2) 0deg);
	display: flex; align-items: center; justify-content: center;
}
.confidence-ring .inner {
	width: 60px; height: 60px; border-radius: 50%; background: var(--surface);
	display: flex; align-items: center; justify-content: center;
	font-weight: 800; font-size: 1.1rem;
}

/* ── TOC ────────────────────────────────────── */
.toc {
	background: var(--surface); border: 1px solid var(--border);
	border-radius: 10px; padding: 1.25rem 1.5rem; margin-bottom: 2rem;
}
.toc h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 0.75rem; }
.toc ul { list-style: none; padding: 0; }
.toc li { padding: 0.25rem 0; }
.toc a {
	color: var(--accent); text-decoration: none; font-size: 0.95rem;
	transition: color 0.15s;
}
.toc a:hover { color: var(--accent-light); text-decoration: underline; }
.toc .toc-l2 { padding-left: 1.25rem; }
.toc .toc-l3 { padding-left: 2.5rem; font-size: 0.9rem; }

/* ── Sections ──────────────────────────────── */
.section {
	margin-bottom: 2.5rem; scroll-margin-top: 2rem;
}
.section h2 {
	font-size: 1.6rem; font-weight: 700; margin-bottom: 1rem;
	padding-bottom: 0.5rem; border-bottom: 2px solid var(--accent);
	color: var(--text);
}
.section h3 {
	font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.75rem;
	color: var(--text);
}
.section h4 {
	font-size: 1.1rem; font-weight: 600; margin: 1.25rem 0 0.5rem;
	color: var(--text-muted);
}
.section p { margin-bottom: 1rem; color: var(--text); }
.section ul, .section ol { margin-bottom: 1rem; padding-left: 1.5rem; }
.section li { margin-bottom: 0.4rem; }
.section strong { color: var(--accent-light); }

/* ── Evidence callout ───────────────────────── */
.evidence {
	background: var(--surface); border-left: 3px solid var(--accent);
	border-radius: 0 8px 8px 0; padding: 1rem 1.25rem; margin: 1rem 0;
	font-size: 0.95rem;
}
.evidence .claim { font-weight: 600; margin-bottom: 0.5rem; }
.evidence .source-ref {
	display: inline-block; font-size: 0.8rem; padding: 0.15rem 0.5rem;
	border-radius: 4px; margin-right: 0.5rem; margin-bottom: 0.25rem;
}

/* ── Tables ─────────────────────────────────── */
.table-wrap { overflow-x: auto; margin: 1rem 0; }
table {
	width: 100%; border-collapse: collapse; font-size: 0.9rem;
}
th, td {
	text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border);
}
th {
	background: var(--surface); font-weight: 600; color: var(--text-muted);
	text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.04em;
}
tr:hover { background: var(--surface-2); }

/* ── Credibility badges ────────────────────── */
.badge {
	display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px;
	font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
	letter-spacing: 0.03em;
}
.badge-tier-1 { background: rgba(59,130,246,0.15); color: var(--tier1); }
.badge-tier-2 { background: rgba(139,92,246,0.15); color: var(--tier2); }
.badge-tier-3 { background: rgba(107,114,128,0.15); color: var(--tier3); }

/* ── Contradictions ─────────────────────────── */
.contradiction {
	background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
	border-radius: 10px; padding: 1.25rem; margin: 1rem 0;
}
.contradiction h4 { color: var(--red); margin-bottom: 0.75rem; }
.contradiction .position {
	background: var(--surface); border-radius: 6px; padding: 0.75rem;
	margin: 0.5rem 0;
}
.contradiction .position .src {
	font-size: 0.85rem; color: var(--accent); font-weight: 600;
}

/* ── Collapsible details ───────────────────── */
details {
	background: var(--surface); border: 1px solid var(--border);
	border-radius: 8px; margin: 0.75rem 0;
}
details summary {
	padding: 0.75rem 1rem; cursor: pointer; font-weight: 600;
	font-size: 0.95rem; list-style: none;
}
details summary::-webkit-details-marker { display: none; }
details summary::before {
	content: '▸ '; color: var(--accent); transition: transform 0.2s;
	display: inline-block;
}
details[open] summary::before { transform: rotate(90deg); }
details .detail-body { padding: 0 1rem 1rem; }

/* ── Footer ─────────────────────────────────── */
.report-footer {
	margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border);
	color: var(--text-muted); font-size: 0.85rem;
}
.report-footer a { color: var(--accent); text-decoration: none; }

/* ── Print ──────────────────────────────────── */
@media print {
	body { background: white; color: black; }
	.container { max-width: 100%; }
	.toc, .meta-grid { break-inside: avoid; }
	.section { break-inside: avoid; }
}

/* ── Responsive ─────────────────────────────── */
@media (max-width: 640px) {
	.report-header h1 { font-size: 1.5rem; }
	.meta-grid { grid-template-columns: repeat(2, 1fr); }
	.container { padding: 1rem; }
}
</style>
</head>
<body>
<div class="container">

<header class="report-header">
<h1>${escapeHtml(data.title)}</h1>
${data.subtitle ? `<p class="subtitle">${escapeHtml(data.subtitle)}</p>` : ""}
<div class="meta-grid">
	<div class="meta-card">
		<div class="confidence-ring"><div class="inner">${data.confidence}%</div></div>
		<div class="label">Confidence</div>
	</div>
	<div class="meta-card">
		<div class="value">${data.totalSources}</div>
		<div class="label">Sources</div>
	</div>
	<div class="meta-card">
		<div class="value">${data.rounds}</div>
		<div class="label">Rounds</div>
	</div>
	<div class="meta-card">
		<div class="value">${data.depth}</div>
		<div class="label">Depth</div>
	</div>
	<div class="meta-card">
		<div class="value">${data.searchProviders.join(", ")}</div>
		<div class="label">Providers</div>
	</div>
</div>
<p style="color:var(--text-muted);font-size:0.9rem;">
	Query: "${escapeHtml(data.query)}" · Generated ${data.generatedAt}${data.duration ? ` · ${data.duration}` : ""}
</p>
</header>

${toc}

<section class="section" id="executive-summary">
<h2>Executive Summary</h2>
<p>${renderMarkdownInline(data.executiveSummary)}</p>
</section>

${sectionsHtml}

${contradictionsHtml}

<section class="section" id="sources">
<h2>Sources</h2>
${sourcesTable}
</section>

<footer class="report-footer">
	<p>Generated by <strong>deep-research</strong> pi package &mdash;
	${data.depth} depth, ${data.rounds} rounds, ${data.totalSources} sources</p>
	<p style="margin-top:0.5rem;">
		Search providers: ${data.searchProviders.map(p => escapeHtml(p)).join(" · ")}
	</p>
</footer>

</div>
</body>
</html>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateTOC(sections: ReportSection[]): string {
	const items: string[] = [];

	function walk(sections: ReportSection[]) {
		for (const s of sections) {
			const id = slugify(s.heading);
			items.push(`<li class="toc-l${s.level}"><a href="#${id}">${escapeHtml(s.heading)}</a></li>`);
			if (s.subsections?.length) walk(s.subsections);
		}
	}

	walk(sections);

	if (items.length === 0) return "";

	// Prepend fixed items
	const allItems = [
		`<li><a href="#executive-summary">Executive Summary</a></li>`,
		...items,
		`<li><a href="#sources">Sources</a></li>`,
	];

	return `<nav class="toc"><h2>Table of Contents</h2><ul>${allItems.join("")}</ul></nav>`;
}

function renderSection(section: ReportSection): string {
	const id = slugify(section.heading);
	const tag = `h${Math.min(section.level, 6)}`;
	const subsectionsHtml = section.subsections?.length
		? section.subsections.map(renderSection).join("\n")
		: "";

	return `<section class="section" id="${id}">
<${tag}>${escapeHtml(section.heading)}</${tag}>
${renderMarkdownContent(section.content)}
${subsectionsHtml}
</section>`;
}

function renderMarkdownContent(md: string): string {
	if (!md) return "";

	let html = md
		// Evidence callouts: > **Claim**: evidence → <div class="evidence">
		.replace(/^>\s*\*\*(.+?)\*\*:\s*(.+)$/gm,
			'<div class="evidence"><div class="claim">$1</div>$2</div>')
		// Bold
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		// Italic
		.replace(/\*(.+?)\*/g, "<em>$1</em>")
		// Inline code
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		// Links [text](url)
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
		// Unordered lists
		.replace(/^- (.+)$/gm, "<li>$1</li>")
		// Ordered lists
		.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
		// Horizontal rules
		.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:1.5rem 0;">')
		// Line breaks → paragraphs (double newline)
		.replace(/\n\n+/g, "</p><p>")
		// Single newline → <br>
		.replace(/\n/g, "<br>");

	// Wrap loose <li> in <ul>
	html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, "<ul>$1</ul>");

	// Wrap in paragraph if not already wrapped
	if (!html.startsWith("<")) html = `<p>${html}</p>`;

	return html;
}

function renderMarkdownInline(md: string): string {
	return md
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\*(.+?)\*/g, "<em>$1</em>")
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
		.replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderSourcesTable(sources: ReportSource[]): string {
	if (sources.length === 0) return "<p>No sources tracked.</p>";

	const rows = sources.map((s, i) => {
		const badge = s.credibility
			? `<span class="badge badge-${s.credibility}">${s.credibility.replace("-", " ")}</span>`
			: "";
		return `<tr>
<td>${i + 1}</td>
<td><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a></td>
<td>${s.date ?? "—"}</td>
<td>${badge}</td>
</tr>`;
	}).join("");

	return `<div class="table-wrap"><table>
<thead><tr><th>#</th><th>Source</th><th>Date</th><th>Credibility</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>`;
}

function renderContradictions(contradictions: ReportData["contradictions"]): string {
	if (!contradictions?.length) return "";

	const items = contradictions.map(c => {
		const positions = c.positions.map(p =>
			`<div class="position"><div class="src">${escapeHtml(p.source)}</div><p>${escapeHtml(p.position)}</p><p style="font-size:0.85rem;color:var(--text-muted)">${escapeHtml(p.evidence)}</p></div>`
		).join("");

		return `<div class="contradiction">
<h4>⚠ Contradiction: ${escapeHtml(c.claim)}</h4>
${positions}
</div>`;
	}).join("");

	return `<section class="section" id="contradictions">
<h2>Contradictions &amp; Nuances</h2>
${items}
</section>`;
}

function slugify(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
