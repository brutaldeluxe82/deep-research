/**
 * File content parser for research.
 *
 * Extracts text from local files for analysis within the research pipeline.
 * Supports: text, markdown, CSV, JSON, YAML, XML, code files, and PDF (via pdftotext).
 *
 * Zero npm deps — uses only Node.js built-in modules.
 * PDF support requires `pdftotext` (poppler-utils) on the system PATH.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

export interface FileParseResult {
	/** Original filename (basename). */
	filename: string;
	/** File extension (lowercase, no dot). */
	extension: string;
	/** Extracted text content. */
	content: string;
	/** Word count of extracted content. */
	wordCount: number;
	/** Whether content was truncated due to size limit. */
	truncated: boolean;
	/** Full absolute path. */
	absolutePath: string;
}

/** Maximum file size to parse (500KB). */
const MAX_FILE_SIZE = 500 * 1024;

/** Estimated characters per token (for max_tokens truncation). */
const CHARS_PER_TOKEN = 4;

/**
 * Parse a local file and extract text content.
 *
 * @param filePath - Absolute or relative path to the file
 * @param maxTokens - Maximum tokens to return (default: 8000)
 * @returns Parsed file content
 */
export function parseFile(
	filePath: string,
	maxTokens: number = 8000,
): FileParseResult {
	const resolved = path.resolve(filePath);
	const filename = path.basename(resolved);
	const ext = path.extname(resolved).toLowerCase().replace(/^\./, "") || "txt";
	const maxChars = maxTokens * CHARS_PER_TOKEN;

	// Check file exists
	if (!fs.existsSync(resolved)) {
		throw new Error(`File not found: ${resolved}`);
	}

	// Check file size
	const stat = fs.statSync(resolved);
	if (stat.size > MAX_FILE_SIZE * 2) {
		// Hard limit — refuse to process very large files
		return {
			filename,
			extension: ext,
			content: `[File too large: ${(stat.size / 1024).toFixed(0)}KB. Maximum size is ${(MAX_FILE_SIZE * 2 / 1024).toFixed(0)}KB.]`,
			wordCount: 0,
			truncated: true,
			absolutePath: resolved,
		};
	}

	// Parse based on extension
	let content: string;

	switch (ext) {
		case "json":
			content = parseJSON(resolved);
			break;
		case "csv":
			content = parseCSV(resolved);
			break;
		case "pdf":
			content = parsePDF(resolved);
			break;
		case "yaml":
		case "yml":
			content = parseYAML(resolved);
			break;
		default:
			// Text-like files: .txt, .md, .xml, .log, .ts, .js, .py, .go, .rs, etc.
			content = parseText(resolved);
			break;
	}

	// Truncate if needed
	let truncated = false;
	if (content.length > maxChars) {
		content = content.slice(0, maxChars) + "\n\n[... content truncated ...]";
		truncated = true;
	}

	const wordCount = content.split(/\s+/).filter(Boolean).length;

	return {
		filename,
		extension: ext,
		content,
		wordCount,
		truncated,
		absolutePath: resolved,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a text file (any readable text). */
function parseText(filePath: string): string {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return `[Could not read file as text: ${filePath}]`;
	}
}

/** Parse a JSON file — pretty-print for readability. */
function parseJSON(filePath: string): string {
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw);

		// If it's an array, summarize and show first few items
		if (Array.isArray(parsed)) {
			let text = `JSON Array: ${parsed.length} items\n\n`;
			const preview = parsed.slice(0, 10);
			text += JSON.stringify(preview, null, 2);
			if (parsed.length > 10) {
				text += `\n\n... ${parsed.length - 10} more items`;
			}
			return text;
		}

		// If it's an object, pretty-print
		return JSON.stringify(parsed, null, 2);
	} catch (err) {
		// Parse error — return raw text
		return fs.readFileSync(filePath, "utf-8");
	}
}

/** Parse a CSV file — basic string splitting with quoted field handling. */
function parseCSV(filePath: string): string {
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const lines = raw.split("\n").filter(l => l.trim().length > 0);

		if (lines.length === 0) return "[Empty CSV file]";

		// Parse header
		const headers = parseCSVLine(lines[0]);
		let text = `CSV: ${lines.length - 1} rows, ${headers.length} columns\n\n`;
		text += `Headers: ${headers.join(" | ")}\n\n`;

		// Parse up to 50 data rows
		const maxRows = Math.min(lines.length - 1, 50);
		for (let i = 1; i <= maxRows; i++) {
			const values = parseCSVLine(lines[i]);
			for (let j = 0; j < headers.length && j < values.length; j++) {
				text += `${headers[j]}: ${values[j]}\n`;
			}
			text += "---\n";
		}

		if (lines.length - 1 > 50) {
			text += `\n... ${lines.length - 1 - 50} more rows`;
		}

		return text;
	} catch {
		return `[Could not parse CSV: ${filePath}]`;
	}
}

/** Parse a single CSV line, handling quoted fields. */
function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];

		if (ch === '"') {
			if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
				// Escaped quote
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === "," && !inQuotes) {
			result.push(current.trim());
			current = "";
		} else if (ch === "\r") {
			// Skip carriage return
		} else {
			current += ch;
		}
	}

	result.push(current.trim());
	return result;
}

/** Parse a YAML file — basic text extraction (no full YAML parser). */
function parseYAML(filePath: string): string {
	try {
		// Basic YAML: just read as text unless it's a simple key: value structure
		// We don't want to add a YAML dep, so return it as-is with a header
		const raw = fs.readFileSync(filePath, "utf-8");
		return `YAML content:\n\n${raw}`;
	} catch {
		return `[Could not read YAML: ${filePath}]`;
	}
}

/** Parse a PDF file — try pdftotext first, then raw text extraction. */
function parsePDF(filePath: string): string {
	// Try pdftotext (from poppler-utils)
	try {
		const result = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", filePath, "-"], {
			timeout: 15000,
			maxBuffer: 1024 * 1024,
			encoding: "utf-8",
		});

		if (result && result.trim().length > 50) {
			return result;
		}
	} catch {
		// pdftotext not available or failed
	}

	// Fallback: read raw bytes and extract printable text
	try {
		const buf = fs.readFileSync(filePath);
		const text = extractTextFromPDFBuffer(buf);
		if (text.trim().length > 0) {
			return text;
		}
	} catch {
		// Raw extraction also failed
	}

	return `[Could not extract text from PDF: ${filePath}. Install poppler-utils for better PDF support: brew install poppler / apt-get install poppler-utils]`;
}

/**
 * Basic text extraction from PDF buffer.
 * Extracts text between stream markers — limited effectiveness
 * but works as a zero-dep fallback.
 */
function extractTextFromPDFBuffer(buf: Buffer): string {
	// Convert to string, keeping only printable ASCII and common Unicode
	const raw = buf.toString("latin1");

	// Look for text between BT (Begin Text) and ET (End Text) markers
	const textParts: string[] = [];
	const btEtPattern = /BT\s*([\s\S]*?)\s*ET/g;
	let match: RegExpExecArray | null;

	while ((match = btEtPattern.exec(raw)) !== null) {
		const block = match[1];
		// Extract text from Tj and TJ operators
		const tjPattern = /\(([^)]*)\)\s*Tj/g;
		let tjMatch: RegExpExecArray | null;
		while ((tjMatch = tjPattern.exec(block)) !== null) {
			const text = tjMatch[1]
				.replace(/\\n/g, "\n")
				.replace(/\\r/g, "\r")
				.replace(/\\t/g, "\t")
				.replace(/\\\(/g, "(")
				.replace(/\\\)/g, ")");
			if (text.trim().length > 0) {
				textParts.push(text);
			}
		}

		// TJ arrays: [(text) num (text) num ...]
		const tjArrayPattern = /\[([^\]]*)\]\s*TJ/g;
		let arrMatch: RegExpExecArray | null;
		while ((arrMatch = tjArrayPattern.exec(block)) !== null) {
			const arr = arrMatch[1];
			const strParts = arr.match(/\(([^)]*)\)/g);
			if (strParts) {
				const combined = strParts
					.map(s => s.slice(1, -1))
					.join("");
				if (combined.trim().length > 0) {
					textParts.push(combined);
				}
			}
		}
	}

	return textParts.join("\n");
}
