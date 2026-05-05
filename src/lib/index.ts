export type {
  ApplyResult,
  ApplyScope,
  MatchMode,
  ParsedXliff,
  PluginToUiMessage,
  ScanResult,
  SourceTextStore,
  TranslationStore,
  TranslationUnit,
  UiToPluginMessage,
} from '../shared/types';

export { I18N_PREFIX, normalizeText } from '../shared/types';
export { parseXliff, detectLanguage } from './xliff';
export { mergeIntoStores } from '../parser/xliff';

