/**
 * jj version detection and capability checking.
 *
 * Used at activation to verify the user has a compatible jj version and to
 * enable/disable features that require specific jj versions.
 *
 * The minimum required version is 0.25.0 (introduced the `json()` template
 * function, which the entire structured-output strategy depends on).
 */

/** A parsed jj version number. */
export interface JjVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /**
   * Pre-release or commit hash suffix (the part after `-` in dev builds).
   * e.g., `"2508982cde5c7e4db0933e0b6469f9e778e71e28"` for
   * `"jj 0.38.0-2508982cde5c7e4db0933e0b6469f9e778e71e28"`.
   * Absent for stable releases.
   */
  readonly preRelease?: string;
  /** The raw version string as reported by `jj --version`. */
  readonly raw: string;
}

/**
 * Feature flags derived from the detected jj version.
 * Capabilities are added here as we discover version-gated APIs.
 */
export interface JjCapabilities {
  /**
   * Whether the `json()` template function is available.
   * Required for structured output. Introduced in jj 0.25.0.
   */
  readonly hasJsonTemplate: boolean;
}

/**
 * The minimum jj version required to run jjvs.
 * This corresponds to the introduction of the `json()` template function.
 * Source: jj changelog for 0.25.0 (https://github.com/martinvonz/jj/releases/tag/v0.25.0)
 */
export const MINIMUM_JJ_VERSION = { major: 0, minor: 25, patch: 0 } as const;

/**
 * Parse the output of `jj --version` into a structured version.
 *
 * Supported formats (verified against jj 0.38.0):
 * - Stable release: `"jj 0.25.0"`
 * - Dev build: `"jj 0.38.0-2508982cde5c7e4db0933e0b6469f9e778e71e28"`
 *
 * @returns `undefined` if the output does not match the expected format.
 */
export function parseJjVersion(versionOutput: string): JjVersion | undefined {
  const raw = versionOutput.trim();
  const match = /^jj (\d+)\.(\d+)\.(\d+)(?:-(\S+))?$/.exec(raw);
  if (!match) {
    return undefined;
  }
  const [, major, minor, patch, preRelease] = match;
  return {
    major: parseInt(major ?? '0', 10),
    minor: parseInt(minor ?? '0', 10),
    patch: parseInt(patch ?? '0', 10),
    preRelease,
    raw,
  };
}

/**
 * Compare two version triples.
 *
 * @returns Positive if `a > b`, zero if equal, negative if `a < b`.
 */
export function compareVersions(
  a: Pick<JjVersion, 'major' | 'minor' | 'patch'>,
  b: Pick<JjVersion, 'major' | 'minor' | 'patch'>,
): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Whether the given version meets the jjvs minimum requirement (>= 0.25.0).
 */
export function meetsMinimumVersion(version: JjVersion): boolean {
  return compareVersions(version, MINIMUM_JJ_VERSION) >= 0;
}

/**
 * Derive feature capability flags from a parsed jj version.
 */
export function getCapabilities(version: JjVersion): JjCapabilities {
  return {
    // json() template function: added in 0.25.0
    hasJsonTemplate: compareVersions(version, { major: 0, minor: 25, patch: 0 }) >= 0,
  };
}

/**
 * Format a version for display (e.g., in error messages).
 */
export function formatVersion(version: Pick<JjVersion, 'major' | 'minor' | 'patch'>): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}
