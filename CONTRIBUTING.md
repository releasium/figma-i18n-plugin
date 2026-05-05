# Contributing

Thanks for contributing.

## Development

### Prerequisites

- Node.js 20
- Figma Desktop app

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch mode (plugin bundles)

```bash
npm run watch
```

Note: `watch` does not rebuild `dist/ui.html`. Run `node scripts/build-ui-html.js` after UI JS changes, or run `npm run build`.

## Pull requests

- Keep changes focused and easy to review.
- If you change parsing or matching logic, add/extend a fixture in `test-fixtures/`.
- Make sure `npm run build` and `npm run typecheck` pass.

