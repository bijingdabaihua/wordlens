import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');
const publicDir = resolve(root, 'public');

// Ensure dist/icons exists
mkdirSync(resolve(dist, 'icons'), { recursive: true });

// Copy manifest.json
const srcManifest = resolve(publicDir, 'manifest.json');
const destManifest = resolve(dist, 'manifest.json');
copyFileSync(srcManifest, destManifest);
console.log('✔ manifest.json copied');

// Copy content.css
const srcCSS = resolve(root, 'src/content/content.css');
const destCSS = resolve(dist, 'content.css');
if (existsSync(srcCSS)) {
  copyFileSync(srcCSS, destCSS);
  console.log('✔ content.css copied');
}

// Copy icons (if they exist)
const iconDir = resolve(publicDir, 'icons');
if (existsSync(iconDir)) {
  const iconFiles = readdirSync(iconDir);
  for (const file of iconFiles) {
    const src = resolve(iconDir, file);
    const dest = resolve(dist, 'icons', file);
    copyFileSync(src, dest);
  }
  if (iconFiles.length > 0) {
    console.log(`✔ ${iconFiles.length} icon(s) copied`);
  }
}

// Flatten HTML files for Chrome extension
const htmlFiles = [
  { src: 'src/popup/index.html', dest: 'popup.html' },
  { src: 'src/options/index.html', dest: 'options.html' },
];

for (const { src, dest } of htmlFiles) {
  const srcPath = resolve(dist, src);
  const destPath = resolve(dist, dest);
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
    console.log(`✔ ${dest} flattened`);
  }
}

console.log('✔ Build complete');
