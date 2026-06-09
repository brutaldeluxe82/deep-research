/**
 * Session-scoped round counter for research_checkpoint.
 *
 * The host LLM decides how many rounds to run; this just tracks
 * how many times checkpoint was called within the session.
 */

let round = 0;

/** Increment and return the current round number. */
export function incrementRound(): number {
	round++;
	return round;
}

/** Reset for a new session. */
export function resetRound(): void {
	round = 0;
}
