#!/usr/bin/env node
/**
 * Patches react-native-web's SYSTEM_FONT_STACK to put CJK fonts first.
 *
 * WHY: RN Web replaces 'System' with a hardcoded font stack that has no CJK fonts.
 * On Windows, the browser falls back to SimSun (宋体, serif) for Chinese characters,
 * causing inconsistent mixed-font rendering. By putting Microsoft YaHei UI / PingFang SC
 * first, ALL characters (Latin + CJK) use the same font → consistent rendering.
 *
 * Run automatically via postinstall:  node scripts/patch-rnweb-font.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const OLD_STACK = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const NEW_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei UI","Microsoft YaHei",-apple-system,BlinkMacSystemFont,"Noto Sans SC","Segoe UI",Roboto,Helvetica,Arial,sans-serif';

const FILES = [
  'node_modules/react-native-web/src/exports/StyleSheet/compiler/createReactDOMStyle.js',
  'node_modules/react-native-web/dist/cjs/exports/StyleSheet/compiler/createReactDOMStyle.js',
  'node_modules/react-native-web/dist/exports/StyleSheet/compiler/createReactDOMStyle.js',
];

let patched = 0;
let alreadyDone = 0;

for (const rel of FILES) {
  const filePath = path.resolve(__dirname, '..', rel);
  if (!fs.existsSync(filePath)) {
    console.warn(`  skip (not found): ${rel}`);
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(NEW_STACK)) {
    alreadyDone++;
    continue;
  }
  if (!content.includes(OLD_STACK)) {
    console.warn(`  skip (unexpected content): ${rel}`);
    continue;
  }
  fs.writeFileSync(filePath, content.replace(OLD_STACK, NEW_STACK), 'utf8');
  console.log(`  patched: ${rel}`);
  patched++;
}

if (patched > 0) {
  console.log(`\n✓ react-native-web CJK font patch applied (${patched} file(s)).\n`);
} else if (alreadyDone > 0) {
  console.log('✓ react-native-web CJK font patch already applied.\n');
} else {
  console.warn('\n⚠ react-native-web CJK font patch: no files were updated.\n');
}
