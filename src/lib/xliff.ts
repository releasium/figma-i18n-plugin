import { XMLParser } from 'fast-xml-parser';
import type { ParsedXliff, TranslationUnit } from '../shared/types';

type AnyRecord = Record<string, any>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function getText(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const obj = v as AnyRecord;
    if (typeof obj['#text'] === 'string') return obj['#text'];
    // Some XMLs end up as { source: { mrk: [...] } } etc; we keep it simple and
    // concatenate nested text nodes in document order as best-effort.
    let out = '';
    for (const key of Object.keys(obj)) {
      out += getText(obj[key]);
    }
    return out;
  }
  return String(v);
}

function collectXliff12TransUnits(node: unknown, out: TranslationUnit[]): void {
  if (!node || typeof node !== 'object') return;

  const obj = node as AnyRecord;
  const tus = obj['trans-unit'];
  for (const tu of asArray<any>(tus)) {
    if (!tu || typeof tu !== 'object') continue;
    const id = (tu as AnyRecord)['@_id'];
    if (!id || typeof id !== 'string') continue;
    const source = getText((tu as AnyRecord)['source']);
    const target = getText((tu as AnyRecord)['target']);
    out.push({ id, source, target });
  }

  for (const key of Object.keys(obj)) {
    collectXliff12TransUnits(obj[key], out);
  }
}

export function parseXliff(xml: string): ParsedXliff {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: false,
    removeNSPrefix: true,
  });

  let root: AnyRecord;
  try {
    root = parser.parse(xml) as AnyRecord;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`XML parse error: ${msg}`);
  }

  const xliff = root?.xliff as AnyRecord | undefined;
  if (!xliff) throw new Error('No <xliff> root element found');

  const version = String(xliff['@_version'] ?? '');
  if (version.startsWith('2')) {
    const sourceLang = (xliff['@_srcLang'] as string | undefined) ?? null;
    const targetLang = (xliff['@_trgLang'] as string | undefined) ?? null;

    const units: TranslationUnit[] = [];
    const file = asArray<any>(xliff['file'])[0];
    for (const unit of asArray<any>(file?.unit)) {
      const id = unit?.['@_id'];
      if (!id || typeof id !== 'string') continue;
      const segment = asArray<any>(unit?.segment)[0];
      if (!segment) continue;
      const source = getText(segment?.source);
      const target = getText(segment?.target);
      units.push({ id, source, target });
    }

    return { sourceLang, targetLang, units };
  }

  // XLIFF 1.2 (or unknown): <file> contains <trans-unit> (possibly nested)
  const file = asArray<any>(xliff['file'])[0];
  const sourceLang = (file?.['@_source-language'] as string | undefined) ?? null;
  const targetLang = (file?.['@_target-language'] as string | undefined) ?? null;

  const units: TranslationUnit[] = [];
  collectXliff12TransUnits(file, units);
  return { sourceLang, targetLang, units };
}

export function detectLanguage(xml: string): { sourceLang: string | null; targetLang: string | null } {
  const parsed = parseXliff(xml);
  return { sourceLang: parsed.sourceLang, targetLang: parsed.targetLang };
}

