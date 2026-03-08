/**
 * ANSI SGR (Select Graphic Rendition) to HTML converter.
 *
 * Converts ANSI escape sequences in `jj show` output to HTML spans with
 * inline styles, using VSCode CSS custom properties for the 16 standard
 * terminal colors. This ensures the colors look correct in all VSCode
 * themes (light, dark, high-contrast).
 *
 * Supported SGR codes:
 *   0        — reset all attributes
 *   1        — bold
 *   2        — dim/faint
 *   3        — italic
 *   4        — underline
 *   22       — normal intensity (clears bold + dim)
 *   23       — not italic
 *   24       — not underlined
 *   30–37    — standard foreground colors
 *   38;5;n   — 256-color foreground
 *   38;2;r;g;b — true color foreground
 *   39       — default foreground
 *   40–47    — standard background colors
 *   48;5;n   — 256-color background
 *   48;2;r;g;b — true color background
 *   49       — default background
 *   90–97    — bright/intense foreground colors
 *   100–107  — bright/intense background colors
 */

const FOREGROUND: Record<number, string> = {
  30: 'var(--vscode-terminal-ansiBlack)',
  31: 'var(--vscode-terminal-ansiRed)',
  32: 'var(--vscode-terminal-ansiGreen)',
  33: 'var(--vscode-terminal-ansiYellow)',
  34: 'var(--vscode-terminal-ansiBlue)',
  35: 'var(--vscode-terminal-ansiMagenta)',
  36: 'var(--vscode-terminal-ansiCyan)',
  37: 'var(--vscode-terminal-ansiWhite)',
  90: 'var(--vscode-terminal-ansiBrightBlack)',
  91: 'var(--vscode-terminal-ansiBrightRed)',
  92: 'var(--vscode-terminal-ansiBrightGreen)',
  93: 'var(--vscode-terminal-ansiBrightYellow)',
  94: 'var(--vscode-terminal-ansiBrightBlue)',
  95: 'var(--vscode-terminal-ansiBrightMagenta)',
  96: 'var(--vscode-terminal-ansiBrightCyan)',
  97: 'var(--vscode-terminal-ansiBrightWhite)',
};

const BACKGROUND: Record<number, string> = {
  40: 'var(--vscode-terminal-ansiBlack)',
  41: 'var(--vscode-terminal-ansiRed)',
  42: 'var(--vscode-terminal-ansiGreen)',
  43: 'var(--vscode-terminal-ansiYellow)',
  44: 'var(--vscode-terminal-ansiBlue)',
  45: 'var(--vscode-terminal-ansiMagenta)',
  46: 'var(--vscode-terminal-ansiCyan)',
  47: 'var(--vscode-terminal-ansiWhite)',
  100: 'var(--vscode-terminal-ansiBrightBlack)',
  101: 'var(--vscode-terminal-ansiBrightRed)',
  102: 'var(--vscode-terminal-ansiBrightGreen)',
  103: 'var(--vscode-terminal-ansiBrightYellow)',
  104: 'var(--vscode-terminal-ansiBrightBlue)',
  105: 'var(--vscode-terminal-ansiBrightMagenta)',
  106: 'var(--vscode-terminal-ansiBrightCyan)',
  107: 'var(--vscode-terminal-ansiBrightWhite)',
};

/** The 16 standard ANSI colors in order (used for 256-color index 0–15). */
const ANSI16 = [
  'var(--vscode-terminal-ansiBlack)',
  'var(--vscode-terminal-ansiRed)',
  'var(--vscode-terminal-ansiGreen)',
  'var(--vscode-terminal-ansiYellow)',
  'var(--vscode-terminal-ansiBlue)',
  'var(--vscode-terminal-ansiMagenta)',
  'var(--vscode-terminal-ansiCyan)',
  'var(--vscode-terminal-ansiWhite)',
  'var(--vscode-terminal-ansiBrightBlack)',
  'var(--vscode-terminal-ansiBrightRed)',
  'var(--vscode-terminal-ansiBrightGreen)',
  'var(--vscode-terminal-ansiBrightYellow)',
  'var(--vscode-terminal-ansiBrightBlue)',
  'var(--vscode-terminal-ansiBrightMagenta)',
  'var(--vscode-terminal-ansiBrightCyan)',
  'var(--vscode-terminal-ansiBrightWhite)',
];

interface SgrState {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

function freshState(): SgrState {
  return { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stateToStyle(s: SgrState): string {
  const parts: string[] = [];
  if (s.fg !== null) parts.push(`color:${s.fg}`);
  if (s.bg !== null) parts.push(`background-color:${s.bg}`);
  if (s.bold) parts.push('font-weight:bold');
  if (s.italic) parts.push('font-style:italic');
  if (s.underline) parts.push('text-decoration:underline');
  if (s.dim) parts.push('opacity:0.7');
  return parts.join(';');
}

function wrap(text: string, state: SgrState): string {
  if (text === '') return '';
  const style = stateToStyle(state);
  const escaped = escapeHtml(text);
  return style !== '' ? `<span style="${style}">${escaped}</span>` : escaped;
}

/**
 * Convert a 256-color palette index to a CSS color string.
 *
 * - Indices 0–15: map to VSCode terminal CSS variables (theme-aware)
 * - Indices 16–231: 6×6×6 RGB cube (each channel: 0→0, 1–5→55+40×n)
 * - Indices 232–255: grayscale ramp from #080808 to #eeeeee
 */
function color256(index: number): string {
  if (index < 16) return ANSI16[index] ?? '#888888';

  if (index < 232) {
    const i = index - 16;
    const b = i % 6;
    const g = Math.floor(i / 6) % 6;
    const r = Math.floor(i / 36);
    const ch = (v: number): number => (v === 0 ? 0 : 55 + v * 40);
    return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
  }

  const level = 8 + (index - 232) * 10;
  return `rgb(${level},${level},${level})`;
}

/**
 * Convert ANSI SGR-colored text to an HTML string with inline styles.
 *
 * The output is intended for injection via `{@html}` inside a `<pre>` element.
 * Newlines are preserved as-is (no `<br>` substitution needed inside `<pre>`).
 */
export function ansiToHtml(input: string): string {
  // Match CSI SGR sequences: ESC [ <params> m
  const SGR = /\x1b\[([0-9;]*)m/g;

  let state = freshState();
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SGR.exec(input)) !== null) {
    if (match.index > lastIndex) {
      result += wrap(input.slice(lastIndex, match.index), state);
    }
    lastIndex = match.index + match[0].length;

    const paramStr = match[1];
    const codes = paramStr === '' ? [0] : paramStr.split(';').map(Number);

    let i = 0;
    while (i < codes.length) {
      const code = codes[i]!;
      if (code === 0) {
        state = freshState();
      } else if (code === 1) {
        state.bold = true;
      } else if (code === 2) {
        state.dim = true;
      } else if (code === 3) {
        state.italic = true;
      } else if (code === 4) {
        state.underline = true;
      } else if (code === 22) {
        state.bold = false;
        state.dim = false;
      } else if (code === 23) {
        state.italic = false;
      } else if (code === 24) {
        state.underline = false;
      } else if (code === 38 || code === 48) {
        const isFg = code === 38;
        const sub = codes[i + 1];
        if (sub === 5 && i + 2 < codes.length) {
          const color = color256(codes[i + 2]!);
          if (isFg) state.fg = color;
          else state.bg = color;
          i += 2;
        } else if (sub === 2 && i + 4 < codes.length) {
          const color = `rgb(${codes[i + 2]!},${codes[i + 3]!},${codes[i + 4]!})`;
          if (isFg) state.fg = color;
          else state.bg = color;
          i += 4;
        }
      } else if (code === 39) {
        state.fg = null;
      } else if (code === 49) {
        state.bg = null;
      } else if (Object.prototype.hasOwnProperty.call(FOREGROUND, code)) {
        state.fg = FOREGROUND[code]!;
      } else if (Object.prototype.hasOwnProperty.call(BACKGROUND, code)) {
        state.bg = BACKGROUND[code]!;
      }
      i++;
    }
  }

  if (lastIndex < input.length) {
    result += wrap(input.slice(lastIndex), state);
  }

  return result;
}
