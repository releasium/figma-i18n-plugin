const fs = require('fs');
const path = require('path');

const jsBundle = fs.readFileSync(path.join(__dirname, '..', 'dist', 'ui.js'), 'utf-8');
const cssFile = path.join(__dirname, '..', 'src', 'ui', 'styles.css');
const css = fs.readFileSync(cssFile, 'utf-8');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${css}</style>
</head>
<body>
  <div id="app"></div>
  <script>${jsBundle}</script>
</body>
</html>`;

fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'ui.html'), html);
console.log('Built dist/ui.html');
