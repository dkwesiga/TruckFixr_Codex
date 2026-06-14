/**
 * Shared verification verdict reporting (TFX-CR-0023, Rec #4).
 *
 * Every verification wrapper (`pnpm test`, `build:client`, `validate:demo-seed`,
 * `verify:browser-smoke`, …) emits ONE structured, machine-parseable verdict so
 * a reviewer (or the daily automation) can always tell these three apart:
 *   - passed  : the check actually ran and succeeded
 *   - failed  : the check ran and failed
 *   - skipped : the check could not run here (e.g. spawn-restricted shell)
 *
 * The historical trust gap was that a *skip* exited 0 with only a console.warn,
 * so by exit code it looked identical to a *pass*. Now a skip is explicitly
 * labeled, and it is treated as a FAILURE whenever full verification is required
 * (CI or TFX_REQUIRE_SPAWN=true).
 */

export const VERDICT_PREFIX = "[verify-result]";

/** True when this environment must run the real (non-lite) checks. */
export function requireFullVerification(env = process.env) {
  return Boolean(env.CI) || env.TFX_REQUIRE_SPAWN === "true";
}

/**
 * Map a verdict status to a process exit code.
 *   passed  -> 0
 *   failed  -> 1
 *   skipped -> 0 locally, 1 when full verification is required
 *   (unknown) -> 1 (fail closed)
 */
export function exitCodeForStatus(status, requireFull) {
  switch (status) {
    case "passed":
      return 0;
    case "failed":
      return 1;
    case "skipped":
      return requireFull ? 1 : 0;
    default:
      return 1;
  }
}

/** Print the single structured verdict line plus a human-readable summary. */
export function emitVerdict({ check, mode = null, status, reason = null }) {
  const verdict = { check, mode, status, reason };
  // Machine-parseable line for tooling / daily review automation.
  // eslint-disable-next-line no-console
  console.log(`${VERDICT_PREFIX} ${JSON.stringify(verdict)}`);

  const label = status.toUpperCase();
  const suffix = reason ? ` — ${reason}` : "";
  const human = `[truckfixr] ${check}${mode ? ` (${mode})` : ""}: ${label}${suffix}`;
  // eslint-disable-next-line no-console
  if (status === "failed") console.error(human);
  else if (status === "skipped") console.warn(human);
  else console.log(human);

  return verdict;
}

/**
 * Emit the verdict and return the exit code the caller should use. Callers do:
 *   process.exit(finishVerification({ check, status, ... }));
 */
export function finishVerification({ check, mode = null, status, reason = null, env = process.env }) {
  emitVerdict({ check, mode, status, reason });
  return exitCodeForStatus(status, requireFullVerification(env));
}
