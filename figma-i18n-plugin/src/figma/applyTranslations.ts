import { ApplyResult, ApplyScope, MatchMode } from '../shared/types';
import { collectFromScope, I18nTextNode } from './findTextNodes';

/**
 * Applies translations to all matching text nodes in the given scope.
 *
 * Performance strategy:
 *  1. Collect all nodes in one traversal pass
 *  2. Filter to only those with a matching translation
 *  3. Pre-collect ALL unique fonts across all matched nodes
 *  4. Batch-load fonts in parallel (one Promise.all instead of N sequential awaits)
 *  5. Set .characters on each node — no more awaits in the hot loop
 */
export async function applyTranslations(
  translations: { [key: string]: string },
  scope: ApplyScope,
  matchMode: MatchMode,
): Promise<ApplyResult> {
  var nodes = collectFromScope(scope, matchMode);

  var result: ApplyResult = {
    updatedCount: 0,
    missingKeys: [],
    skippedCount: 0,
    fontFailures: [],
  };

  // Phase 1: Partition nodes into actionable vs missing/skipped
  var toUpdate: { node: TextNode; text: string }[] = [];
  var mixedFontNodes: { node: TextNode; text: string }[] = [];

  for (var i = 0; i < nodes.length; i++) {
    var entry = nodes[i];
    var translated = translations[entry.key];

    if (translated === undefined) {
      result.missingKeys.push(entry.key);
      continue;
    }

    if (matchMode === 'source-text' && entry.node.characters === translated) {
      continue;
    }

    if (entry.node.fontName === figma.mixed) {
      mixedFontNodes.push({ node: entry.node, text: translated });
    } else {
      toUpdate.push({ node: entry.node, text: translated });
    }
  }

  // Phase 2: Collect unique fonts from all single-font nodes
  var fontMap = new Map<string, FontName>();
  for (var j = 0; j < toUpdate.length; j++) {
    var fn = toUpdate[j].node.fontName as FontName;
    var fk = fn.family + '::' + fn.style;
    if (!fontMap.has(fk)) {
      fontMap.set(fk, fn);
    }
  }

  // Also collect fonts from mixed-font nodes
  for (var m = 0; m < mixedFontNodes.length; m++) {
    collectMixedFonts(mixedFontNodes[m].node, fontMap);
  }

  // Phase 3: Batch-load all fonts in parallel
  var failedFonts = new Set<string>();
  var fontEntries = Array.from(fontMap.entries());
  var loadPromises: Promise<void>[] = [];

  for (var f = 0; f < fontEntries.length; f++) {
    loadPromises.push(loadOneFont(fontEntries[f][0], fontEntries[f][1], failedFonts));
  }
  await Promise.all(loadPromises);

  // Phase 4: Apply text to single-font nodes (no more awaits)
  for (var k = 0; k < toUpdate.length; k++) {
    var item = toUpdate[k];
    var font = item.node.fontName as FontName;
    var fontKey = font.family + '::' + font.style;

    if (failedFonts.has(fontKey)) {
      result.fontFailures.push(
        item.node.name + ': font not available (' + font.family + ' ' + font.style + ')',
      );
      result.skippedCount++;
      continue;
    }

    try {
      item.node.characters = item.text;
      result.updatedCount++;
    } catch (err) {
      var msg = err instanceof Error ? err.message : String(err);
      result.fontFailures.push(item.node.name + ': ' + msg);
      result.skippedCount++;
    }
  }

  // Phase 5: Apply text to mixed-font nodes
  for (var n = 0; n < mixedFontNodes.length; n++) {
    var mItem = mixedFontNodes[n];
    var hasMissingFont = checkMixedFontFailures(mItem.node, failedFonts);

    if (hasMissingFont) {
      result.fontFailures.push(mItem.node.name + ': one or more fonts not available (mixed-font node)');
      result.skippedCount++;
      continue;
    }

    try {
      mItem.node.characters = mItem.text;
      result.updatedCount++;
    } catch (err) {
      var msg2 = err instanceof Error ? err.message : String(err);
      result.fontFailures.push(mItem.node.name + ': ' + msg2);
      result.skippedCount++;
    }
  }

  return result;
}

/**
 * Loads a single font, recording failures in the failedFonts set.
 * Never throws — failures are tracked, not propagated.
 */
async function loadOneFont(
  key: string,
  font: FontName,
  failedFonts: Set<string>,
): Promise<void> {
  try {
    await figma.loadFontAsync(font);
  } catch (_e) {
    failedFonts.add(key);
  }
}

/** Adds all unique fonts from a mixed-font node to the shared fontMap */
function collectMixedFonts(node: TextNode, fontMap: Map<string, FontName>): void {
  var len = node.characters.length;
  for (var i = 0; i < len; i++) {
    var fn = node.getRangeFontName(i, i + 1);
    if (fn === figma.mixed) continue;
    var key = fn.family + '::' + fn.style;
    if (!fontMap.has(key)) {
      fontMap.set(key, fn);
    }
  }
}

/** Checks whether any font used by a mixed-font node failed to load */
function checkMixedFontFailures(node: TextNode, failedFonts: Set<string>): boolean {
  var len = node.characters.length;
  for (var i = 0; i < len; i++) {
    var fn = node.getRangeFontName(i, i + 1);
    if (fn === figma.mixed) continue;
    var key = fn.family + '::' + fn.style;
    if (failedFonts.has(key)) return true;
  }
  return false;
}
