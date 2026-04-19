#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_FILE = path.resolve(__dirname, '../src/i18n/translations.ts');

const KNOWN_MOJIBAKE_FRAGMENTS = [
  'Ã',
  'Â',
  'â€',
  'â€™',
  'â€œ',
  'â€”',
  'â€¦',
  '�',
];

const C1_CONTROL_RE = /[\u0080-\u009F]/;
const HAN_RE = /\p{Script=Han}/gu;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function extractZhBlock(content) {
  const match = content.match(/zh\s*:\s*\{([\s\S]*?)\n\s*\},\s*\n?\s*\};/);
  if (!match) return null;
  return match[1];
}

function extractStringValues(objectBody) {
  const values = [];
  const valueRe = /'[^']+'\s*:\s*'((?:\\'|[^'])*)'/g;
  let m;
  while ((m = valueRe.exec(objectBody)) !== null) {
    values.push(m[1]);
  }
  return values;
}

// Non-ASCII punctuation that should be plain ASCII in code and spec docs.
// These are valid UTF-8 but cause mojibake when files are opened in Windows-1252 editors,
// and spread bad text into code comments and commit messages.
const NON_ASCII_PUNCT = [
  ['\u2014', '"--" (em dash)'],
  ['\u2013', '"-" (en dash)'],
  ['\u2192', '"->" (right arrow)'],
  ['\u2264', '"<=" (less-than-or-equal)'],
  ['\u2265', '">=" (greater-than-or-equal)'],
  ['\u2026', '"..." (ellipsis)'],
  ['\u2018', "\"'\" (left single quote)"],
  ['\u2019', "\"'\" (right single quote)"],
  ['\u201C', '"\\\"" (left double quote)'],
  ['\u201D', '"\\\"" (right double quote)'],
];

// Scan spec/doc files for non-ASCII punctuation (these should use plain ASCII).
const DOCS_GLOB = path.resolve(__dirname, '../../docs/specs');
if (fs.existsSync(DOCS_GLOB)) {
  let docFailures = 0;
  const docFiles = fs.readdirSync(DOCS_GLOB)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(DOCS_GLOB, f));
  for (const docFile of docFiles) {
    const docLines = fs.readFileSync(docFile, 'utf8').split('\n');
    const rel = path.relative(process.cwd(), docFile);
    for (let i = 0; i < docLines.length; i++) {
      for (const [ch, label] of NON_ASCII_PUNCT) {
        if (docLines[i].includes(ch)) {
          console.error(`${rel}:${i + 1} contains ${label} -- use plain ASCII equivalent`);
          docFailures++;
          break;
        }
      }
    }
  }
  if (docFailures > 0) {
    console.error(`\nDocs encoding check failed with ${docFailures} issue(s). Run the fix-ascii script or replace manually.\n`);
    process.exit(1);
  }
}

const content = fs.readFileSync(TARGET_FILE, 'utf8');
const relPath = path.relative(process.cwd(), TARGET_FILE);
const lines = content.split('\n');

let failures = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (C1_CONTROL_RE.test(line)) {
    console.error(`${relPath}:${i + 1} contains C1 control characters (possible encoding damage)`);
    failures++;
  }
  for (const frag of KNOWN_MOJIBAKE_FRAGMENTS) {
    if (line.includes(frag)) {
      console.error(`${relPath}:${i + 1} contains mojibake fragment "${frag}"`);
      failures++;
      break;
    }
  }
}

const zhBlock = extractZhBlock(content);
if (!zhBlock) {
  fail(`${relPath}: unable to locate zh translation block`);
}

const zhValues = extractStringValues(zhBlock);
if (zhValues.length < 200) {
  console.error(`${relPath}: expected many zh values, found only ${zhValues.length}`);
  failures++;
}

let valuesWithHan = 0;
let totalHanChars = 0;
for (const value of zhValues) {
  const matches = value.match(HAN_RE);
  const count = matches ? matches.length : 0;
  if (count > 0) valuesWithHan++;
  totalHanChars += count;
}

const hanValueRatio = zhValues.length > 0 ? valuesWithHan / zhValues.length : 0;
if (valuesWithHan < 80) {
  console.error(`${relPath}: zh values containing Chinese characters too low (${valuesWithHan})`);
  failures++;
}
if (totalHanChars < 500) {
  console.error(`${relPath}: total Chinese character count too low (${totalHanChars})`);
  failures++;
}
if (hanValueRatio < 0.2) {
  console.error(`${relPath}: Chinese coverage ratio too low (${hanValueRatio.toFixed(2)})`);
  failures++;
}

if (failures > 0) {
  console.error(`\nEncoding guard failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Encoding guard passed: no mojibake patterns and zh block health looks good.');
