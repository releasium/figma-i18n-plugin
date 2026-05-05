import {
  ParsedXliff,
  TranslationUnit,
  TranslationStore,
  SourceTextStore,
  normalizeText,
} from '../shared/types';

/**
 * Parses an XLIFF (1.2 or 2.0) XML string into a structured result.
 * Uses the browser DOMParser available in the Figma plugin UI context.
 */
export function parseXliff(xml: string): ParsedXliff {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('XML parse error: ' + (parseError.textContent || 'unknown'));
  }

  const xliffRoot = doc.querySelector('xliff');
  if (!xliffRoot) {
    throw new Error('No <xliff> root element found');
  }

  const version = xliffRoot.getAttribute('version') || '';
  if (version.startsWith('2')) {
    return parseXliff2(doc);
  }
  return parseXliff12(doc);
}

/** XLIFF 1.2: <file> with trans-unit children */
function parseXliff12(doc: Document): ParsedXliff {
  const fileEl = doc.querySelector('file');
  const sourceLang = fileEl?.getAttribute('source-language') ?? null;
  const targetLang = fileEl?.getAttribute('target-language') ?? null;

  const units: TranslationUnit[] = [];
  const transUnits = doc.querySelectorAll('trans-unit');

  transUnits.forEach(function (tu) {
    const id = tu.getAttribute('id');
    if (!id) return;

    const source = getDirectTextContent(tu, 'source');
    const target = getDirectTextContent(tu, 'target');

    units.push({ id: id, source: source, target: target });
  });

  return { sourceLang: sourceLang, targetLang: targetLang, units: units };
}

/** XLIFF 2.0: <file> → <unit> → <segment> → <source>/<target> */
function parseXliff2(doc: Document): ParsedXliff {
  const xliffRoot = doc.querySelector('xliff');
  const sourceLang = xliffRoot?.getAttribute('srcLang') ?? null;
  const targetLang = xliffRoot?.getAttribute('trgLang') ?? null;

  const units: TranslationUnit[] = [];
  const unitEls = doc.querySelectorAll('unit');

  unitEls.forEach(function (unit) {
    const id = unit.getAttribute('id');
    if (!id) return;

    const segment = unit.querySelector('segment');
    if (!segment) return;

    const source = getDirectTextContent(segment, 'source');
    const target = getDirectTextContent(segment, 'target');

    units.push({ id: id, source: source, target: target });
  });

  return { sourceLang: sourceLang, targetLang: targetLang, units: units };
}

/** Safely reads the text content of a child element by tag name, trimmed */
function getDirectTextContent(parent: Element, tagName: string): string {
  const el = parent.querySelector(tagName);
  return normalizeText(el?.textContent ?? '');
}

/**
 * Merges a ParsedXliff result into ID-based and source-text-based stores.
 *
 * Builds both forward and reverse maps:
 * - Forward (targetLang): source text → target text
 *   e.g. for es.xlf: sourceStore["es"]["Monthly Rent"] = "Renta mensual"
 * - Reverse (sourceLang): target text → source text
 *   e.g. for es.xlf: sourceStore["en"]["Renta mensual"] = "Monthly Rent"
 *
 * The reverse map enables translating BACK to the source language after
 * a translation has been applied.
 *
 * @param idStore      - mutable store keyed by trans-unit ID
 * @param sourceStore  - mutable store keyed by normalized text content
 * @param parsed       - the parsed XLIFF result
 * @param langOverride - optional manual language override from the user
 * @returns array of language codes that were added/updated
 */
export function mergeIntoStores(
  idStore: TranslationStore,
  sourceStore: SourceTextStore,
  parsed: ParsedXliff,
  langOverride?: string,
): string[] {
  var targetLang = langOverride || parsed.targetLang || parsed.sourceLang || 'unknown';
  var sourceLang = parsed.sourceLang || null;
  var addedLangs: string[] = [];

  if (!idStore[targetLang]) {
    idStore[targetLang] = {};
  }
  if (!sourceStore[targetLang]) {
    sourceStore[targetLang] = {};
  }
  addedLangs.push(targetLang);

  // Build reverse map for source language if it differs from target
  var buildReverse = sourceLang && sourceLang !== targetLang;
  if (buildReverse) {
    if (!idStore[sourceLang!]) {
      idStore[sourceLang!] = {};
    }
    if (!sourceStore[sourceLang!]) {
      sourceStore[sourceLang!] = {};
    }
    if (addedLangs.indexOf(sourceLang!) === -1) {
      addedLangs.push(sourceLang!);
    }
  }

  for (var i = 0; i < parsed.units.length; i++) {
    var unit = parsed.units[i];
    var target = unit.target || unit.source;
    if (!target) continue;

    var normalizedSource = unit.source ? normalizeText(unit.source) : '';
    var normalizedTarget = normalizeText(target);

    // Forward: source text → target text (for translating TO targetLang)
    idStore[targetLang][unit.id] = target;
    if (normalizedSource) {
      sourceStore[targetLang][normalizedSource] = normalizedTarget;
    }

    // Reverse: target text → source text (for translating BACK to sourceLang)
    if (buildReverse && normalizedSource && normalizedTarget !== normalizedSource) {
      sourceStore[sourceLang!][normalizedTarget] = normalizedSource;
    }
  }

  return addedLangs;
}

/**
 * Standalone utility for extracting language from an XLIFF string
 * without doing a full parse.
 */
export function detectLanguage(xml: string): { sourceLang: string | null; targetLang: string | null } {
  var parser = new DOMParser();
  var doc = parser.parseFromString(xml, 'application/xml');

  var xliffRoot = doc.querySelector('xliff');
  var version = xliffRoot?.getAttribute('version') || '';

  if (version.startsWith('2')) {
    return {
      sourceLang: xliffRoot?.getAttribute('srcLang') ?? null,
      targetLang: xliffRoot?.getAttribute('trgLang') ?? null,
    };
  }

  var fileEl = doc.querySelector('file');
  return {
    sourceLang: fileEl?.getAttribute('source-language') ?? null,
    targetLang: fileEl?.getAttribute('target-language') ?? null,
  };
}
