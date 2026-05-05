# i18n XLIFF Localizer — Figma Plugin + npm Library

A Figma plugin that localizes text layers using XLIFF/XLF files (Angular i18n friendly), plus a small npm library you can reuse for parsing/merging XLIFF into translation stores.

## Install (library)

```bash
npm install figma-i18n-xliff-plugin
```

## Library usage

```ts
import { parseXliff, mergeIntoStores } from 'figma-i18n-xliff-plugin';

const idStore = {};
const sourceStore = {};

const parsed = parseXliff(xmlString);
mergeIntoStores(idStore, sourceStore, parsed);
```

Exports:

- `parseXliff(xml)` / `detectLanguage(xml)` (Node + browser)
- `mergeIntoStores(idStore, sourceStore, parsed, langOverride?)`
- `normalizeText(text)`

## How It Works

1. **Naming convention**: Text layers in Figma are named with the prefix `i18n:` followed by the translation key.
   Example: `i18n:promo.hero.title`

2. **Upload XLF files**: Load one or more `.xlf` / `.xliff` files through the plugin UI.

3. **Select language**: Choose the target language from the dropdown.

4. **Apply**: The plugin finds all matching text layers and replaces their content with the translations.

## File Structure

```
figma-i18n-plugin/
├── manifest.json            # Figma plugin manifest
├── package.json
├── tsconfig.json
├── scripts/
│   └── build-ui-html.js     # Builds the final UI HTML from JS bundle + CSS
├── src/
│   ├── code.ts              # Plugin main thread (runs in Figma sandbox)
│   ├── shared/
│   │   └── types.ts         # Shared types and message contracts
│   ├── parser/
│   │   └── xliff.ts         # XLIFF 1.2 / 2.0 parser (runs in UI thread)
│   ├── figma/
│   │   ├── findTextNodes.ts # Recursive node traversal and scanning
│   │   └── applyTranslations.ts  # Font loading + text replacement
│   └── ui/
│       ├── index.tsx         # Plugin UI logic (runs in browser iframe)
│       └── styles.css        # UI styles
├── test-fixtures/
│   ├── messages.pl.xlf       # Example XLIFF 1.2 — Polish
│   ├── messages.de.xlf       # Example XLIFF 1.2 — German
│   ├── messages.uk.xlf       # Example XLIFF 1.2 — Ukrainian
│   └── messages.fr.xliff2.xlf  # Example XLIFF 2.0 — French
└── dist/                     # Build output (generated)
    ├── code.js
    └── ui.html
```

## Prerequisites

- Node.js 18+
- Figma Desktop app

## Setup & Build

```bash
npm install
npm run build
```

For development with auto-rebuild:

```bash
npm run watch
```

Note: when using `watch`, the UI HTML is not automatically rebuilt.
Run `node scripts/build-ui-html.js` after UI JS changes, or run a full `npm run build`.

## Load in Figma

1. Open Figma Desktop.
2. Go to **Plugins → Development → Import plugin from manifest…**
3. Select the `manifest.json` file from this directory.
4. The plugin will appear under **Plugins → Development → i18n XLIFF Localizer**.

## Usage

1. Open the plugin from the Figma menu.
2. Click the file input and select one or more `.xlf` / `.xliff` files.
3. Click **Load Translations**.
4. Select a language from the dropdown.
5. Choose scope: **Selected nodes** or **Whole current page**.
6. Click **Scan** to preview how many layers will be affected.
7. Click **Apply Translations** to replace text.

## Layer Naming Convention

Text layers must be named with the `i18n:` prefix:

| Layer Name                    | Translation Key         |
|-------------------------------|------------------------|
| `i18n:promo.hero.title`      | `promo.hero.title`     |
| `i18n:nav.home`              | `nav.home`             |
| `i18n:listing.apply.button`  | `listing.apply.button` |

The plugin ignores text layers that don't follow this convention.

## XLIFF Support

| Feature              | XLIFF 1.2 | XLIFF 2.0 |
|---------------------|-----------|-----------|
| Parse trans-units   | Yes       | —         |
| Parse units/segments| —         | Yes       |
| Language detection  | Yes       | Yes       |
| Source text         | Yes       | Yes       |
| Target text         | Yes       | Yes       |

## Assumptions & Limitations

- **Figma is not the source of truth** for translations. XLF files are the source.
- **Mixed-font nodes**: If a text node uses multiple fonts, the plugin loads all fonts
  before replacing text. If any font fails to load, the node is skipped.
- **Component instances**: Text inside instances can often be edited. If Figma restricts
  the edit, the node is skipped and reported.
- **No external services**: Everything runs locally in the plugin; no network calls.
- **Memory only**: Translations are kept in memory for the plugin session. Reloading the
  plugin resets the store.
- **Flat key mapping**: Nested XLIFF structures (groups, etc.) are flattened by `id`.
  The `id` attribute is the key used for matching.
- **No ICU / interpolation**: Placeholders like `{{count}}` are inserted as-is.
  The plugin does not interpret Angular template expressions.
