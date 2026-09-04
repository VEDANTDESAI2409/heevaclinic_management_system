// Generates PWA icon PNGs from the SVG master using ImageMagick.
// Run: node scripts/make-icons.js
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const src = 'public/icons/icon.svg';
const out = 'public/icons';
mkdirSync(out, { recursive: true });

function magick(w, h, file, extra = '') {
  // -background none so maskable gets its own canvas handling below
  execSync(`magick -background none -density ${w} ${src} -resize ${w}x${h} ${extra} ${file}`, { stdio: 'inherit' });
}

magick(192, 192, `${out}/icon-192.png`);
magick(512, 512, `${out}/icon-512.png`);
// maskable: content on an opaque navy square so OS masking never clips the glyph
execSync(
  `magick -size 512x512 xc:'#0B1F35' -density 512 ${src} -resize 384x384 -gravity center -composite ${out}/maskable-512.png`,
  { stdio: 'inherit' }
);
console.log('Icons generated: icon-192.png, icon-512.png, maskable-512.png');
