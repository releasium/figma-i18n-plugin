/**
 * Map of language code → { translation key → translated string }.
 * Keys can be either trans-unit IDs or normalized source text, depending on match mode.
 */
export type TranslationStore = {
  [lang: string]: {
    [key: string]: string;
  };
};

/**
 * Source-text-based translation map: normalized source text → target text.
 * Used for "match by text content" mode where we compare a Figma layer's
 * visible text to the <source> element in the XLF.
 */
export type SourceTextStore = {
  [lang: string]: {
    [normalizedSource: string]: string;
  };
};

/** Result of parsing a single XLIFF file */
export interface ParsedXliff {
  sourceLang: string | null;
  targetLang: string | null;
  units: TranslationUnit[];
}

export interface TranslationUnit {
  id: string;
  source: string;
  target: string;
}

/** Scope of the apply operation */
export type ApplyScope = 'selection' | 'page';

/**
 * How the plugin matches Figma text layers to translation entries:
 *
 * - 'source-text': Compares the layer's visible .characters (trimmed) to
 *    the <source> text in the XLF. Best for Angular i18n numeric-hash IDs.
 *
 * - 'layer-name': Looks for layers named "i18n:<key>" and matches <key>
 *    to the trans-unit ID. Best for human-readable keys.
 */
export type MatchMode = 'source-text' | 'layer-name';

/** Summary returned after applying translations */
export interface ApplyResult {
  updatedCount: number;
  missingKeys: string[];
  skippedCount: number;
  fontFailures: string[];
}

/** Summary returned when scanning for i18n text nodes */
export interface ScanResult {
  totalTextNodes: number;
  matchedCount: number;
  unmatchedCount: number;
  matchedSamples: string[];
}

// ── Messages between UI ↔ Plugin main thread ──────────────────────────

export type UiToPluginMessage =
  | {
      type: 'load-translations';
      idStore: TranslationStore;
      sourceStore: SourceTextStore;
      languages: string[];
    }
  | { type: 'apply-translations'; lang: string; scope: ApplyScope; matchMode: MatchMode }
  | { type: 'scan'; scope: ApplyScope; matchMode: MatchMode };

export type PluginToUiMessage =
  | { type: 'apply-result'; result: ApplyResult }
  | { type: 'scan-result'; result: ScanResult }
  | { type: 'error'; message: string };

/** Prefix used in Figma text node names to mark them as i18n-keyed */
export const I18N_PREFIX = 'i18n:';

/** Normalizes a string for source-text matching (collapse whitespace, trim) */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
