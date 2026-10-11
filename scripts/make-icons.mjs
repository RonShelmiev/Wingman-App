// Renders the app icons and iPhone launch screens to PNG with Playwright.
// Run: npx -y -p playwright node scripts/make-icons.mjs   (output goes to public/icons and public/splash)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const ORANGE = '#D24B1F';
const INK = '#141826';

// The Wingman mark: two stacked chevrons, like wings in formation.
const mark = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <path d="M104 292 256 140l152 152h-70l-82-82-82 82z" fill="#fff"/>
    <path d="M178 368 256 290l78 78h-52l-26-26-26 26z" fill="#fff" fill-opacity=".72"/>
  </g>`;
const iconSvg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${ORANGE}"/>${mark(scale)}</svg>`;

const ICONS = [
  ['icons/apple-touch-icon.png', 180, 1],
  ['icons/icon-192.png', 192, 1],
  ['icons/icon-512.png', 512, 1],
  // Maskable: Android crops to a circle, so keep the mark inside the middle 80%.
  ['icons/maskable-512.png', 512, 0.78],
];

// iPhone portrait screens: CSS width, height, pixel ratio.
const SCREENS = [
  [440, 956, 3], [430, 932, 3], [402, 874, 3], [393, 852, 3], [428, 926, 3],
  [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2],
];

const splashHtml = (w, h) => `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&display=swap" rel="stylesheet">
<style>html,body{margin:0;width:${w}px;height:${h}px;background:${INK};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;font-family:'Bricolage Grotesque',sans-serif}
.i{width:96px;height:96px;border-radius:26px;overflow:hidden}.t{color:#fff;font-size:30px;font-weight:700;letter-spacing:-.01em}</style></head>
<body><div class="i">${iconSvg(1)}</div><div class="t">Wingman</div></body></html>`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
mkdirSync('public/icons', { recursive: true });
mkdirSync('public/splash', { recursive: true });

for (const [file, size, scale] of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${iconSvg(scale).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/${file}` });
  await page.close();
}

const links = [];
for (const [w, h, dpr] of SCREENS) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await page.setContent(splashHtml(w, h), { waitUntil: 'networkidle' });
  const name = `splash/launch-${w * dpr}x${h * dpr}.png`;
  await page.screenshot({ path: `public/${name}` });
  await page.close();
  links.push(`<link rel="apple-touch-startup-image" href="/${name}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)">`);
}
await browser.close();
console.log(links.join('\n'));
