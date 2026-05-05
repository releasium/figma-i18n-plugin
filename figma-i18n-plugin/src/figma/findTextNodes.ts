import { I18N_PREFIX, MatchMode, ScanResult, normalizeText } from '../shared/types';

export interface I18nTextNode {
  node: TextNode;
  key: string;
}

export function extractI18nKey(name: string): string | null {
  if (name.startsWith(I18N_PREFIX)) {
    return name.slice(I18N_PREFIX.length).trim();
  }
  return null;
}

export function findTextNodes(root: SceneNode | PageNode, matchMode: MatchMode): I18nTextNode[] {
  var results: I18nTextNode[] = [];
  walkNode(root, results, matchMode);
  return results;
}

function walkNode(node: SceneNode | PageNode, results: I18nTextNode[], matchMode: MatchMode): void {
  if (node.type === 'TEXT') {
    if (matchMode === 'layer-name') {
      var key = extractI18nKey(node.name);
      if (key) {
        results.push({ node: node, key: key });
      }
    } else {
      var text = normalizeText(node.characters);
      if (text.length > 0) {
        results.push({ node: node, key: text });
      }
    }
    return;
  }

  if ('children' in node) {
    for (var i = 0; i < (node as any).children.length; i++) {
      walkNode((node as any).children[i] as SceneNode, results, matchMode);
    }
  }
}

export function collectFromScope(scope: 'selection' | 'page', matchMode: MatchMode): I18nTextNode[] {
  if (scope === 'page') {
    return findTextNodes(figma.currentPage, matchMode);
  }

  var results: I18nTextNode[] = [];
  for (var i = 0; i < figma.currentPage.selection.length; i++) {
    var selected = figma.currentPage.selection[i];
    var nodes = findTextNodes(selected, matchMode);
    for (var j = 0; j < nodes.length; j++) {
      results.push(nodes[j]);
    }
  }
  return results;
}

/**
 * Single-pass scan: walks the tree once, counts total text nodes,
 * collects matched keys, and computes unmatched — all in one traversal.
 */
export function scanScope(
  scope: 'selection' | 'page',
  matchMode: MatchMode,
  availableKeys: Set<string>,
): ScanResult {
  var totalTextNodes = 0;
  var matchedCount = 0;
  var matchedSamples: string[] = [];

  function visit(node: SceneNode | PageNode): void {
    if (node.type === 'TEXT') {
      totalTextNodes++;

      var key: string | null = null;
      if (matchMode === 'layer-name') {
        key = extractI18nKey(node.name);
      } else {
        var text = normalizeText(node.characters);
        if (text.length > 0) {
          key = text;
        }
      }

      if (key !== null && availableKeys.has(key)) {
        matchedCount++;
        if (matchedSamples.length < 20) {
          matchedSamples.push(key);
        }
      }
      return;
    }

    if ('children' in node) {
      for (var i = 0; i < (node as any).children.length; i++) {
        visit((node as any).children[i] as SceneNode);
      }
    }
  }

  if (scope === 'page') {
    visit(figma.currentPage);
  } else {
    for (var s = 0; s < figma.currentPage.selection.length; s++) {
      visit(figma.currentPage.selection[s]);
    }
  }

  return {
    totalTextNodes: totalTextNodes,
    matchedCount: matchedCount,
    unmatchedCount: totalTextNodes - matchedCount,
    matchedSamples: matchedSamples,
  };
}
