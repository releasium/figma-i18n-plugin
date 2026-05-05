import { parseXliff, mergeIntoStores } from '../parser/xliff';
import {
  TranslationStore,
  SourceTextStore,
  PluginToUiMessage,
  UiToPluginMessage,
  ApplyScope,
  MatchMode,
  ApplyResult,
  ScanResult,
} from '../shared/types';

// ── State ──────────────────────────────────────────────────────────────

var idStore: TranslationStore = {};
var sourceStore: SourceTextStore = {};
var languages: string[] = [];
var selectedLang = '';
var scope: ApplyScope = 'selection';
var matchMode: MatchMode = 'source-text';

var loadedFiles: { name: string; lang: string; keyCount: number }[] = [];

// ── DOM Helpers ────────────────────────────────────────────────────────

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function show(id: string, text: string, className?: string): void {
  var el = $(id);
  el.textContent = text;
  el.style.display = 'block';
  if (className) {
    el.className = className;
  }
}

function hide(id: string): void {
  $(id).style.display = 'none';
}

function clearMessages(): void {
  hide('error-msg');
  hide('success-msg');
  hide('result-details');
}

// ── Render ─────────────────────────────────────────────────────────────

function renderApp(): void {
  var app = $('app');
  app.innerHTML =
    '<h1>i18n XLIFF Localizer</h1>' +

    '<section class="section">' +
      '<h2>1. Load Translation Files</h2>' +
      '<p class="hint">Upload one or more .xlf / .xliff files from your Angular project</p>' +
      '<input type="file" id="file-input" accept=".xlf,.xliff,.xml" multiple />' +
      '<button id="btn-load" class="btn btn-primary" disabled>Load Translations</button>' +
      '<div id="file-list" class="file-list"></div>' +
    '</section>' +

    '<section class="section">' +
      '<h2>2. Match Mode</h2>' +
      '<div class="radio-group">' +
        '<label>' +
          '<input type="radio" name="matchMode" value="source-text" checked />' +
          '<span>Match by text content</span>' +
        '</label>' +
        '<label>' +
          '<input type="radio" name="matchMode" value="layer-name" />' +
          '<span>Match by layer name (i18n:key)</span>' +
        '</label>' +
      '</div>' +
      '<p class="hint" id="match-mode-hint">Compares the visible text in each layer to the &lt;source&gt; text in the XLF. Best for Angular i18n files with numeric IDs.</p>' +
    '</section>' +

    '<section class="section">' +
      '<h2>3. Select Language</h2>' +
      '<select id="lang-select" disabled>' +
        '<option value="">— load files first —</option>' +
      '</select>' +
    '</section>' +

    '<section class="section">' +
      '<h2>4. Scope</h2>' +
      '<div class="radio-group">' +
        '<label>' +
          '<input type="radio" name="scope" value="selection" checked />' +
          '<span>Selected nodes</span>' +
        '</label>' +
        '<label>' +
          '<input type="radio" name="scope" value="page" />' +
          '<span>Whole current page</span>' +
        '</label>' +
      '</div>' +
    '</section>' +

    '<section class="section actions">' +
      '<button id="btn-scan" class="btn btn-secondary">Scan</button>' +
      '<button id="btn-apply" class="btn btn-primary" disabled>Apply Translations</button>' +
    '</section>' +

    '<div id="scan-summary" class="summary" style="display:none"></div>' +
    '<div id="error-msg" class="msg msg-error" style="display:none"></div>' +
    '<div id="success-msg" class="msg msg-success" style="display:none"></div>' +
    '<div id="result-details" class="result-details" style="display:none"></div>';

  bindEvents();
}

// ── File Handling ──────────────────────────────────────────────────────

var pendingFiles: { name: string; content: string }[] = [];

function bindEvents(): void {
  var fileInput = $('file-input') as HTMLInputElement;
  var btnLoad = $('btn-load') as HTMLButtonElement;
  var langSelect = $('lang-select') as HTMLSelectElement;
  var btnScan = $('btn-scan') as HTMLButtonElement;
  var btnApply = $('btn-apply') as HTMLButtonElement;

  fileInput.addEventListener('change', function () {
    clearMessages();
    var files = fileInput.files;
    if (!files || files.length === 0) {
      btnLoad.disabled = true;
      return;
    }

    pendingFiles = [];
    var remaining = files.length;

    for (var i = 0; i < files.length; i++) {
      (function (file: File) {
        var reader = new FileReader();
        reader.onload = function () {
          pendingFiles.push({ name: file.name, content: reader.result as string });
          remaining--;
          if (remaining === 0) {
            btnLoad.disabled = false;
            show('success-msg', pendingFiles.length + ' file(s) ready to load', 'msg msg-info');
          }
        };
        reader.onerror = function () {
          remaining--;
          show('error-msg', 'Failed to read file: ' + file.name, 'msg msg-error');
        };
        reader.readAsText(file);
      })(files[i]);
    }
  });

  btnLoad.addEventListener('click', function () {
    clearMessages();
    loadTranslations();
  });

  langSelect.addEventListener('change', function () {
    selectedLang = langSelect.value;
    btnApply.disabled = !selectedLang;
  });

  // Match mode
  var matchRadios = document.querySelectorAll('input[name="matchMode"]');
  for (var i = 0; i < matchRadios.length; i++) {
    matchRadios[i].addEventListener('change', function (e: Event) {
      matchMode = (e.target as HTMLInputElement).value as MatchMode;
      updateMatchModeHint();
    });
  }

  // Scope
  var scopeRadios = document.querySelectorAll('input[name="scope"]');
  for (var j = 0; j < scopeRadios.length; j++) {
    scopeRadios[j].addEventListener('change', function (e: Event) {
      scope = (e.target as HTMLInputElement).value as ApplyScope;
    });
  }

  btnScan.addEventListener('click', function () {
    clearMessages();
    sendToPlugin({ type: 'scan', scope: scope, matchMode: matchMode });
  });

  btnApply.addEventListener('click', function () {
    clearMessages();
    if (!selectedLang) {
      show('error-msg', 'Please select a language first', 'msg msg-error');
      return;
    }
    sendToPlugin({ type: 'apply-translations', lang: selectedLang, scope: scope, matchMode: matchMode });
  });
}

function updateMatchModeHint(): void {
  var hint = $('match-mode-hint');
  if (matchMode === 'source-text') {
    hint.innerHTML = 'Compares the visible text in each layer to the &lt;source&gt; text in the XLF. Best for Angular i18n files with numeric IDs.';
  } else {
    hint.innerHTML = 'Looks for layers named <strong>i18n:&lt;key&gt;</strong> and matches &lt;key&gt; to the trans-unit ID.';
  }
}

function loadTranslations(): void {
  if (pendingFiles.length === 0) {
    show('error-msg', 'No files selected', 'msg msg-error');
    return;
  }

  loadedFiles = [];
  idStore = {};
  sourceStore = {};
  languages = [];

  var errors: string[] = [];

  for (var i = 0; i < pendingFiles.length; i++) {
    var file = pendingFiles[i];
    try {
      var parsed = parseXliff(file.content);
      var addedLangs = mergeIntoStores(idStore, sourceStore, parsed);

      // The first lang in the array is the target language of this file
      var fileLang = addedLangs[0];
      var keyCount = Object.keys(sourceStore[fileLang] || {}).length;

      for (var li = 0; li < addedLangs.length; li++) {
        if (languages.indexOf(addedLangs[li]) === -1) {
          languages.push(addedLangs[li]);
        }
      }

      loadedFiles.push({ name: file.name, lang: fileLang, keyCount: keyCount });
    } catch (err) {
      var msg = err instanceof Error ? err.message : String(err);
      errors.push(file.name + ': ' + msg);
    }
  }

  if (errors.length > 0) {
    show('error-msg', 'Errors:\n' + errors.join('\n'), 'msg msg-error');
  }

  if (languages.length > 0) {
    sendToPlugin({
      type: 'load-translations',
      idStore: idStore,
      sourceStore: sourceStore,
      languages: languages,
    });
    updateLanguageSelect();
    updateFileList();

    var totalKeys = 0;
    var langs = Object.keys(sourceStore);
    for (var k = 0; k < langs.length; k++) {
      totalKeys += Object.keys(sourceStore[langs[k]]).length;
    }
    show(
      'success-msg',
      'Loaded ' + totalKeys + ' translation(s) across ' + languages.length + ' language(s)',
      'msg msg-success',
    );
  }
}

function updateLanguageSelect(): void {
  var select = $('lang-select') as HTMLSelectElement;
  select.innerHTML = '<option value="">— select language —</option>';
  for (var i = 0; i < languages.length; i++) {
    var opt = document.createElement('option');
    opt.value = languages[i];
    opt.textContent = languages[i].toUpperCase();
    select.appendChild(opt);
  }
  select.disabled = languages.length === 0;

  if (languages.length === 1) {
    select.value = languages[0];
    selectedLang = languages[0];
    ($('btn-apply') as HTMLButtonElement).disabled = false;
  }
}

function updateFileList(): void {
  var container = $('file-list');
  if (loadedFiles.length === 0) {
    container.innerHTML = '';
    return;
  }

  var html = '';
  for (var i = 0; i < loadedFiles.length; i++) {
    var f = loadedFiles[i];
    html +=
      '<div class="file-item">' +
        '<span class="file-name">' + escapeHtml(f.name) + '</span>' +
        '<span class="file-meta">' + f.lang.toUpperCase() + ' &middot; ' + f.keyCount + ' keys</span>' +
      '</div>';
  }
  container.innerHTML = html;
}

// ── Plugin Messages ────────────────────────────────────────────────────

function sendToPlugin(msg: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

window.onmessage = function (event: MessageEvent) {
  var msg = event.data.pluginMessage as PluginToUiMessage;
  if (!msg) return;

  clearMessages();

  switch (msg.type) {
    case 'scan-result':
      handleScanResult(msg.result);
      break;
    case 'apply-result':
      handleApplyResult(msg.result);
      break;
    case 'error':
      show('error-msg', msg.message, 'msg msg-error');
      break;
  }
};

function handleScanResult(result: ScanResult): void {
  var summary = $('scan-summary');

  var html =
    '<div class="summary-row"><strong>Total text layers:</strong> ' + result.totalTextNodes + '</div>' +
    '<div class="summary-row"><strong>Matched to translations:</strong> ' + result.matchedCount + '</div>' +
    '<div class="summary-row"><strong>No translation found:</strong> ' + result.unmatchedCount + '</div>';

  if (result.matchedSamples.length > 0) {
    html += '<details><summary>Matched samples (first ' + result.matchedSamples.length + ')</summary><pre>';
    for (var i = 0; i < result.matchedSamples.length; i++) {
      html += escapeHtml(result.matchedSamples[i]) + '\n';
    }
    html += '</pre></details>';
  }

  summary.innerHTML = html;
  summary.style.display = 'block';
}

function handleApplyResult(result: ApplyResult): void {
  show(
    'success-msg',
    'Applied: ' + result.updatedCount + ' updated, ' + result.missingKeys.length + ' not found, ' + result.skippedCount + ' skipped',
    'msg msg-success',
  );

  if (result.missingKeys.length > 0 || result.fontFailures.length > 0) {
    var details = $('result-details');
    var html = '';

    if (result.fontFailures.length > 0) {
      html += '<details open><summary>Font / edit failures (' + result.fontFailures.length + ')</summary><pre>' + escapeHtml(result.fontFailures.join('\n')) + '</pre></details>';
    }
    if (result.missingKeys.length > 0 && result.missingKeys.length <= 50) {
      html += '<details><summary>Missing translations (' + result.missingKeys.length + ')</summary><pre>' + escapeHtml(result.missingKeys.join('\n')) + '</pre></details>';
    } else if (result.missingKeys.length > 50) {
      html += '<details><summary>Missing translations (' + result.missingKeys.length + ', showing first 50)</summary><pre>' + escapeHtml(result.missingKeys.slice(0, 50).join('\n')) + '\n...' + '</pre></details>';
    }

    details.innerHTML = html;
    details.style.display = 'block';
  }
}

// ── Utils ──────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// ── Init ───────────────────────────────────────────────────────────────

renderApp();
