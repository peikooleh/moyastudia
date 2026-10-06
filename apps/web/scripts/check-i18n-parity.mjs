import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "..", "lib", "i18n.js"), "utf8");
const locales = ["en", "ru", "uk"];

function localeBlock(locale, nextLocale) {
  const start = source.indexOf(`  ${locale}: {`);
  if (start < 0) throw new Error(`Locale block not found: ${locale}`);
  const end = nextLocale
    ? source.indexOf(`  ${nextLocale}: {`, start)
    : source.indexOf("\n};", start);
  if (end < 0) throw new Error(`Locale block end not found: ${locale}`);
  return source.slice(start, end);
}

function localeKeys(block) {
  return new Set([...block.matchAll(/^ {4}([A-Za-z0-9_]+):/gm)].map((match) => match[1]));
}

const keys = Object.fromEntries(
  locales.map((locale, index) => [
    locale,
    localeKeys(localeBlock(locale, locales[index + 1])),
  ]),
);

const baseline = keys.en;
let failed = false;

for (const locale of locales.slice(1)) {
  const missing = [...baseline].filter((key) => !keys[locale].has(key));
  const extra = [...keys[locale]].filter((key) => !baseline.has(key));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`i18n parity failed for ${locale}:`);
    if (missing.length) console.error(`  missing: ${missing.join(", ")}`);
    if (extra.length) console.error(`  extra: ${extra.join(", ")}`);
  }
}

if (failed) process.exit(1);

console.log(`i18n parity OK: ${baseline.size} keys in EN/RU/UK`);
