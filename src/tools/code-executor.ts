/**
 * Sandboxed Node.js code execution for research.
 *
 * SECURITY MODEL:
 * - Code runs in a child process (not vm module — vm is not safe for sandboxing)
 * - Temp file is written, executed with `node`, then deleted
 * - Memory limited via --max-old-space-size=256
 * - Timeout enforced via process kill
 * - Must be explicitly enabled in config (research_code_execution_enabled: true)
 *
 * Avoids npm deps — uses only node:child_process, node:fs, node:os, node:path.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface CodeExecutionResult {
	/** Whether the code ran without errors. */
	success: boolean;
	/** Captured stdout. */
	stdout: string;
	/** Captured stderr. */
	stderr: string;
	/** Process exit code. */
	exitCode: number | null;
	/** Execution time in ms. */
	durationMs: number;
	/** Language that was executed. */
	language: string;
}

/**
 * Execute JavaScript code in a sandboxed Node.js subprocess.
 *
 * @param code - The JavaScript code to execute
 * @param timeoutMs - Maximum execution time (default: 30000ms)
 * @returns Structured result with stdout, stderr, exit code, and timing
 */
export async function executeCode(
	code: string,
	timeoutMs: number = 30000,
): Promise<CodeExecutionResult> {
	const tmpDir = os.tmpdir();
	const tmpFile = path.join(tmpDir, `deep-research-code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mjs`);

	const startTime = Date.now();

	try {
		// Write code to temp file
		fs.writeFileSync(tmpFile, code, { mode: 0o600 });

		// Execute with resource limits
		const result = await new Promise<CodeExecutionResult>((resolve, reject) => {
			const child = execFile(
				"node",
				[
					"--max-old-space-size=256",
					"--no-experimental-detect-module",
					tmpFile,
				],
				{
					timeout: timeoutMs,
					maxBuffer: 1024 * 1024, // 1MB stdout/stderr
					env: {
						// Minimal env — no access to user's API keys or config
						NODE_ENV: "production",
						HOME: tmpDir,
						PATH: process.env.PATH ?? "",
						TEMP: tmpDir,
						TMPDIR: tmpDir,
					},
					// Run from tmpdir, not project dir
					cwd: tmpDir,
				},
				(err, stdout, stderr) => {
					const durationMs = Date.now() - startTime;

					if (err) {
						// Timeout, killed, or non-zero exit
						const isTimeout = err.killed === true || err.signal === "SIGTERM";
						resolve({
							success: false,
							stdout: stdout ?? "",
							stderr: isTimeout
								? `Execution timed out after ${timeoutMs}ms`
								: (stderr || err.message) ?? "",
							exitCode: typeof err.code === "number" ? err.code : (isTimeout ? -1 : 1),
							durationMs,
							language: "javascript",
						});
					} else {
						resolve({
							success: true,
							stdout: stdout ?? "",
							stderr: stderr ?? "",
							exitCode: 0,
							durationMs,
							language: "javascript",
						});
					}
				},
			);
		});

		return result;
	} catch (err) {
		return {
			success: false,
			stdout: "",
			stderr: err instanceof Error ? err.message : String(err),
			exitCode: -1,
			durationMs: Date.now() - startTime,
			language: "javascript",
		};
	} finally {
		// Always clean up temp file
		try {
			if (fs.existsSync(tmpFile)) {
				fs.unlinkSync(tmpFile);
			}
		} catch {
			// Cleanup failure is non-fatal
		}
	}
}
