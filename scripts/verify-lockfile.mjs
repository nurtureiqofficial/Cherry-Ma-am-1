import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const root = lock.packages?.[''];

if (!root) throw new Error('package-lock.json has no root package entry');

const expected = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const actual = { ...(root.dependencies ?? {}), ...(root.devDependencies ?? {}) };

const missing = Object.keys(expected).filter((name) => !(name in actual));
const mismatched = Object.keys(expected).filter((name) => name in actual && expected[name] !== actual[name]);

if (missing.length || mismatched.length) {
  console.error('package.json and package-lock.json are out of sync.');
  if (missing.length) console.error(`Missing from lockfile root: ${missing.join(', ')}`);
  if (mismatched.length) console.error(`Version spec mismatches: ${mismatched.join(', ')}`);
  process.exit(1);
}

console.log('package.json and package-lock.json root dependency specs are synchronized.');
