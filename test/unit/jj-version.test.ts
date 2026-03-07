import { describe, it, expect } from 'vitest';
import {
  parseJjVersion,
  compareVersions,
  meetsMinimumVersion,
  getCapabilities,
  formatVersion,
  MINIMUM_JJ_VERSION,
} from '../../src/core/jj-version';

describe('parseJjVersion', () => {
  it('parses a stable release version', () => {
    const version = parseJjVersion('jj 0.25.0');
    expect(version).toEqual({
      major: 0,
      minor: 25,
      patch: 0,
      preRelease: undefined,
      raw: 'jj 0.25.0',
    });
  });

  it('parses a dev build version with commit hash suffix', () => {
    // Real output from jj 0.38.0 on 2026-03-07
    const version = parseJjVersion(
      'jj 0.38.0-2508982cde5c7e4db0933e0b6469f9e778e71e28',
    );
    expect(version).toMatchObject({
      major: 0,
      minor: 38,
      patch: 0,
      preRelease: '2508982cde5c7e4db0933e0b6469f9e778e71e28',
    });
  });

  it('parses a version with trailing whitespace', () => {
    const version = parseJjVersion('jj 0.38.0  ');
    expect(version?.major).toBe(0);
    expect(version?.minor).toBe(38);
    expect(version?.patch).toBe(0);
  });

  it('returns undefined for unrecognised format', () => {
    expect(parseJjVersion('git version 2.44.0')).toBeUndefined();
    expect(parseJjVersion('')).toBeUndefined();
    expect(parseJjVersion('0.38.0')).toBeUndefined();
    expect(parseJjVersion('jj')).toBeUndefined();
  });

  it('preserves the raw version string', () => {
    const raw = 'jj 0.38.0-abc123';
    expect(parseJjVersion(raw)?.raw).toBe(raw);
  });
});

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions({ major: 0, minor: 25, patch: 0 }, { major: 0, minor: 25, patch: 0 })).toBe(0);
  });

  it('compares major versions', () => {
    expect(compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 0, minor: 99, patch: 99 })).toBeGreaterThan(0);
    expect(compareVersions({ major: 0, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBeLessThan(0);
  });

  it('compares minor versions when major is equal', () => {
    expect(compareVersions({ major: 0, minor: 26, patch: 0 }, { major: 0, minor: 25, patch: 0 })).toBeGreaterThan(0);
  });

  it('compares patch versions when major and minor are equal', () => {
    expect(compareVersions({ major: 0, minor: 25, patch: 1 }, { major: 0, minor: 25, patch: 0 })).toBeGreaterThan(0);
  });
});

describe('meetsMinimumVersion', () => {
  it('returns true for versions meeting the minimum', () => {
    const v = parseJjVersion('jj 0.25.0');
    expect(v).toBeDefined();
    if (v) expect(meetsMinimumVersion(v)).toBe(true);
  });

  it('returns true for versions above the minimum', () => {
    const v = parseJjVersion('jj 0.38.0');
    expect(v).toBeDefined();
    if (v) expect(meetsMinimumVersion(v)).toBe(true);
  });

  it('returns false for versions below the minimum', () => {
    const v = parseJjVersion('jj 0.24.0');
    expect(v).toBeDefined();
    if (v) expect(meetsMinimumVersion(v)).toBe(false);
  });
});

describe('getCapabilities', () => {
  it('reports hasJsonTemplate as true for jj >= 0.25.0', () => {
    const v = parseJjVersion('jj 0.25.0')!;
    expect(getCapabilities(v).hasJsonTemplate).toBe(true);
  });

  it('reports hasJsonTemplate as true for recent versions', () => {
    const v = parseJjVersion('jj 0.38.0')!;
    expect(getCapabilities(v).hasJsonTemplate).toBe(true);
  });

  it('reports hasJsonTemplate as false for jj < 0.25.0', () => {
    const v = parseJjVersion('jj 0.24.0')!;
    expect(getCapabilities(v).hasJsonTemplate).toBe(false);
  });
});

describe('formatVersion', () => {
  it('formats a version as major.minor.patch', () => {
    expect(formatVersion({ major: 0, minor: 38, patch: 0 })).toBe('0.38.0');
    expect(formatVersion({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3');
  });

  it('formats the minimum version constant', () => {
    expect(formatVersion(MINIMUM_JJ_VERSION)).toBe('0.25.0');
  });
});
