/**
 * Provider health tracking — records successes/failures to adaptively
 * rank providers in the parallel search fan-out.
 *
 * Health scores decay: recent failures (5 min) count double.
 * Scores drive sort order in parallelSearch — unhealthy providers get
 * fewer requests, buying them time to recover.
 */

export class ProviderHealth {
	private static stats = new Map<string, { successes: number; failures: number; lastFailureAt: number; avgLatencyMs: number }>();

	/** Record a successful search. */
	static recordSuccess(provider: string, latencyMs: number): void {
		const s = ProviderHealth.stats.get(provider) ?? { successes: 0, failures: 0, lastFailureAt: 0, avgLatencyMs: 0 };
		s.successes++;
		s.avgLatencyMs = s.avgLatencyMs === 0 ? latencyMs : Math.round((s.avgLatencyMs * 0.8) + (latencyMs * 0.2));
		ProviderHealth.stats.set(provider, s);
	}

	/** Record a failed search. */
	static recordFailure(provider: string): void {
		const s = ProviderHealth.stats.get(provider) ?? { successes: 0, failures: 0, lastFailureAt: 0, avgLatencyMs: 0 };
		s.failures++;
		s.lastFailureAt = Date.now();
		ProviderHealth.stats.set(provider, s);
	}

	/** Get health score 0-100. 100=perfect, lower=unreliable. */
	static getHealth(provider: string): number {
		const s = ProviderHealth.stats.get(provider);
		if (!s) return 100; // No data = assume healthy
		if (s.successes === 0 && s.failures === 0) return 100;

		// Recent failures (last 5 min) count double
		const recentPenalty = (Date.now() - s.lastFailureAt < 300000 && s.failures > 0) ? s.failures : 0;
		const totalPenalty = s.failures + recentPenalty;

		return Math.max(0, 100 - (totalPenalty * 10));
	}

	/** Get health summary for status/debug. */
	static getSummary(): Record<string, { health: number; successes: number; failures: number; avgLatencyMs: number }> {
		const result: Record<string, { health: number; successes: number; failures: number; avgLatencyMs: number }> = {};
		for (const [provider, s] of ProviderHealth.stats) {
			result[provider] = { health: ProviderHealth.getHealth(provider), ...s };
		}
		return result;
	}

	/** Reset all health data (e.g. on new session). */
	static reset(): void {
		ProviderHealth.stats.clear();
	}
}
