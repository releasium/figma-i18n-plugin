import {
  UiToPluginMessage,
  PluginToUiMessage,
  TranslationStore,
  SourceTextStore,
} from './shared/types';
import { applyTranslations } from './figma/applyTranslations';
import { scanScope } from './figma/findTextNodes';

/**
 * Two parallel stores:
 * - idStore: trans-unit ID → target text (for layer-name matching)
 * - sourceStore: normalized source text → target text (for source-text matching)
 */
var idStore: TranslationStore = {};
var sourceStore: SourceTextStore = {};

figma.showUI(__html__, { width: 520, height: 700 });

figma.ui.onmessage = async function (msg: UiToPluginMessage) {
  switch (msg.type) {
    case 'load-translations': {
      idStore = msg.idStore;
      sourceStore = msg.sourceStore;
      figma.notify(
        'Loaded translations for: ' + msg.languages.join(', '),
        { timeout: 3000 },
      );
      break;
    }

    case 'scan': {
      try {
        var keysForScan: Set<string>;
        if (msg.matchMode === 'source-text') {
          keysForScan = getAllKeys(sourceStore);
        } else {
          keysForScan = getAllKeys(idStore);
        }
        var scanResult = scanScope(msg.scope, msg.matchMode, keysForScan);
        sendToUi({ type: 'scan-result', result: scanResult });
      } catch (err) {
        sendToUi({ type: 'error', message: errorMessage(err) });
      }
      break;
    }

    case 'apply-translations': {
      var store = msg.matchMode === 'source-text' ? sourceStore : idStore;
      var langMap = store[msg.lang];
      if (!langMap) {
        sendToUi({
          type: 'error',
          message: 'No translations loaded for language "' + msg.lang + '"',
        });
        return;
      }

      try {
        var applyResult = await applyTranslations(langMap, msg.scope, msg.matchMode);
        sendToUi({ type: 'apply-result', result: applyResult });
        figma.notify(
          'Done: ' + applyResult.updatedCount + ' updated, ' + applyResult.missingKeys.length + ' missing',
          { timeout: 4000 },
        );
      } catch (err) {
        sendToUi({ type: 'error', message: errorMessage(err) });
      }
      break;
    }
  }
};

function sendToUi(msg: PluginToUiMessage): void {
  figma.ui.postMessage(msg);
}

function getAllKeys(store: TranslationStore | SourceTextStore): Set<string> {
  var keys = new Set<string>();
  var langs = Object.keys(store);
  for (var i = 0; i < langs.length; i++) {
    var langKeys = Object.keys(store[langs[i]]);
    for (var j = 0; j < langKeys.length; j++) {
      keys.add(langKeys[j]);
    }
  }
  return keys;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
