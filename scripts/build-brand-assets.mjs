// 브랜드 자산 생성기. 원본 public/brand/source/woori-bohumso-logo3-master.svg 하나만 보고
// viewBox 와 path 선택으로만 파생물을 만든다. 도형을 다시 그리지 않는다.
// PNG 는 저장소에 이미 있는 Playwright Chromium 으로 렌더링한다(새 패키지 없음).
// 몇 번을 실행해도 같은 결과가 나온다.
import PW_LAUNCH from '../tests/playwright-launch.cjs';
import {chromium} from '@playwright/test';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';

const BRAND = 'public/brand';
const MASTER = BRAND + '/source/woori-bohumso-logo3-master.svg';
const INK = '#01404B';

const master = await readFile(MASTER, 'utf8');
const viewBox = master.match(/viewBox="([^"]+)"/)?.[1];
if (viewBox !== '0 0 1562 434') throw Error('원본 viewBox 가 예상과 다릅니다: ' + viewBox);

// path 요소를 통째로 뽑아 둔다. d 속성은 손대지 않는다.
const paths = {};
for (const m of master.matchAll(/<path\b[^>]*\/>|<path\b[^>]*>[\s\S]*?<\/path>/g)) {
  const el = m[0];
  const id = el.match(/id="([^"]+)"/)?.[1];
  if (id) paths[id] = el;
}
for (const id of ['ring', 'door', 'wordmark']) if (!paths[id]) throw Error('원본에 path#' + id + ' 가 없습니다');

const browser = await chromium.launch(PW_LAUNCH);
const page = await browser.newPage();

// 각 path 의 실제 경계를 재서 자른다. 눈대중 수치를 쓰지 않는다.
await page.setContent(`<svg id="m" xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${paths.ring}${paths.door}${paths.wordmark}</svg>`);
const box = await page.evaluate(() => {
  const r = {};
  for (const id of ['ring', 'door', 'wordmark']) {
    const b = document.getElementById(id).getBBox();
    r[id] = {x: b.x, y: b.y, w: b.width, h: b.height};
  }
  return r;
});
const round = n => Math.round(n * 100) / 100;
const symbol = {
  x: round(Math.min(box.ring.x, box.door.x)),
  y: round(Math.min(box.ring.y, box.door.y)),
  w: round(Math.max(box.ring.x + box.ring.w, box.door.x + box.door.w) - Math.min(box.ring.x, box.door.x)),
  h: round(Math.max(box.ring.y + box.ring.h, box.door.y + box.door.h) - Math.min(box.ring.y, box.door.y)),
};

const svg = (vb, body, {width, height} = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''} role="img" aria-label="우리보험소">${body}</svg>\n`;
const rect = (vb, fill) => {
  const [x, y, w, h] = vb.split(' ').map(Number);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
};
const recolor = (el, fill) => el.replace(/fill="#[0-9A-Fa-f]{6}"/, `fill="${fill}"`);

// 가로형: 사방 여백 = 심볼 높이의 12%
const pad = round(symbol.h * 0.12);
const hVB = [round(symbol.x - pad), round(symbol.y - pad), round(1562 - symbol.x + pad * 2), round(symbol.h + pad * 2)].join(' ');
const hBody = paths.ring + paths.door + paths.wordmark;
const files = {
  'logo-horizontal.svg': svg(hVB, rect(hVB, '#FFFFFF') + hBody),
  'logo-horizontal-transparent.svg': svg(hVB, hBody),
  'logo-horizontal-mono.svg': svg(hVB, rect(hVB, '#FFFFFF') + recolor(paths.ring, INK) + recolor(paths.door, INK) + paths.wordmark),
  'logo-horizontal-mono-transparent.svg': svg(hVB, recolor(paths.ring, INK) + recolor(paths.door, INK) + paths.wordmark),
  // 어두운 배경용: 심볼은 그대로, 글자만 흰색
  'logo-horizontal-reverse.svg': svg(hVB, paths.ring + paths.door + recolor(paths.wordmark, '#FFFFFF')),
};

// 심볼 단독
const sVB = [symbol.x, symbol.y, symbol.w, symbol.h].join(' ');
files['logo-symbol.svg'] = svg(sVB, paths.ring + paths.door);
files['favicon.svg'] = svg(sVB, paths.ring + paths.door);

// 앱 아이콘: 정사각형 안에서 심볼 폭이 지정 비율
function iconSVG(ratio, {background = '#FFFFFF', ink = false} = {}) {
  const side = 1024;
  const scale = (side * ratio) / symbol.w;
  const w = symbol.w * scale, h = symbol.h * scale;
  const tx = round((side - w) / 2 - symbol.x * scale), ty = round((side - h) / 2 - symbol.y * scale);
  const g = `<g transform="translate(${tx} ${ty}) scale(${round(scale)})">`
    + (ink ? recolor(paths.ring, INK) + recolor(paths.door, INK) : paths.ring + paths.door) + '</g>';
  const vb = `0 0 ${side} ${side}`;
  return svg(vb, (background ? rect(vb, background) : '') + g);
}
files['app-icon.svg'] = iconSVG(0.64);
files['app-icon-transparent.svg'] = iconSVG(0.64, {background: null});
files['app-icon-mono.svg'] = iconSVG(0.64, {ink: true});
files['app-icon-mono-transparent.svg'] = iconSVG(0.64, {background: null, ink: true});

await mkdir(BRAND, {recursive: true});
for (const [name, body] of Object.entries(files)) await writeFile(path.join(BRAND, name), body, 'utf8');

// PNG: 투명 배경이 필요한 것은 omitBackground 로 뽑는다.
async function png(name, source, size, {transparent = false} = {}) {
  await page.setViewportSize({width: size, height: size});
  await page.setContent(`<!doctype html><style>html,body{margin:0;padding:0;background:${transparent ? 'transparent' : '#fff'}}
    svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
  await writeFile(path.join(BRAND, name), await page.screenshot({omitBackground: transparent}));
}
async function pngWide(name, source, width, height) {
  await page.setViewportSize({width, height});
  await page.setContent(`<!doctype html><style>html,body{margin:0;padding:0;background:transparent}
    svg{display:block;width:${width}px;height:${height}px}</style>${source}`);
  await writeFile(path.join(BRAND, name), await page.screenshot({omitBackground: true}));
}

const [, , hw, hh] = hVB.split(' ').map(Number);
const logoW = 640, logoH = Math.round((logoW * hh) / hw);
await pngWide('logo-horizontal.png', files['logo-horizontal-transparent.svg'], logoW * 2, logoH * 2); // @2x

await png('app-icon-1024.png', files['app-icon.svg'], 1024);
await png('app-icon-color.png', files['app-icon.svg'], 1024);
await png('app-icon-mono.png', files['app-icon-mono.svg'], 1024);
await png('app-icon-maskable-512.png', iconSVG(0.5), 512);
await png('apple-touch-icon.png', files['app-icon.svg'], 180);
for (const size of [32, 192, 512]) await png('favicon-' + size + '.png', files['favicon.svg'], size, {transparent: true});

await browser.close();
console.log('브랜드 자산 생성 완료 · 심볼 bbox', JSON.stringify(symbol), '· 여백', pad);
