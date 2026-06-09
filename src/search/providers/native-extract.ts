/**
 * Native content extractor — no API key required.
 *
 * Fetches URLs with node:fetch, strips HTML noise, returns clean text.
 * Always available as the zero-config fallback.
 *
 * 
 * - Uses only node:fetch (no external deps)
 * - isAvailable() returns true (always available)
 * - extract() catches all errors and returns null (never throws)
 * - Timeout: 15s
 */

import type { ContentExtractor, ExtractResult } from "../types.ts";

export class NativeContentExtractor implements ContentExtractor {
	readonly name = "native";
	readonly label = "Native HTTP Extract";

	isAvailable(): boolean {
		return true;
	}

	async extract(url: string, opts?: { maxTokens?: number; format?: "text" | "markdown" | "html" }): Promise<ExtractResult> {
		try {
			const maxChars = (opts?.maxTokens ?? 5000) * 4;

			const resp = await fetch(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				},
				redirect: "follow",
				signal: AbortSignal.timeout(15000),
			});

			if (!resp.ok) {
				throw new Error(`Failed to fetch ${url}: ${resp.status}`);
			}

			const html = await resp.text();

			// Extract title
			const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
			const title = titleMatch?.[1]?.replace(/&[^;]+;/g, " ").trim() ?? url;

			// Strip noise tags
			let content = html;
			for (const tag of ["script", "style", "nav", "footer", "header", "aside"]) {
				content = content.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), "");
			}

			// Strip remaining tags → plain text
			content = content
				.replace(/<br\s*\/?>/gi, "\n")
				.replace(/<\/p>/gi, "\n\n")
				.replace(/<\/h[1-6]>/gi, "\n\n")
				.replace(/<\/li>/gi, "\n")
				.replace(/<[^>]+>/g, "")
				.replace(/&nbsp;/g, " ")
				.replace(/&amp;/g, "&")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/&quot;/g, '"')
				.replace(/&#\d+;/g, "")
				.replace(/\n{3,}/g, "\n\n")
				.replace(/[ \t]+/g, " ")
				.trim();

			const words = content.split(/\s+/);
			const truncated = words.length > maxChars / 4;
			if (truncated) {
				content = words.slice(0, maxChars / 4).join(" ") + "\n\n[... truncated]";
			}

			return {
				title,
				url,
				content,
				contentType: opts?.format ?? "text",
				wordCount: words.length,
				truncated,
			};
		} catch {
			// Never throw — return null so the fallback chain continues
			return null;
		}
	}
}
