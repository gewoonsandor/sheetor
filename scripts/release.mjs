// Cuts a release: sets one version in every manifest, dates the changelog's Unreleased notes,
// commits `release X.Y.Z` and tags it `vX.Y.Z`. It pushes nothing; the last line says how.
// Usage: npm run release -- <patch|minor|major|X.Y.Z>   (the npm script runs the gate first)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const fail = message => {
  console.error(`release: ${message}`);
  process.exit(1);
};

const current = JSON.parse(readFileSync('package.json', 'utf8')).version;
const [major, minor, patch] = current.split('-')[0].split('.').map(Number);
const bumps = { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` };
const arg = process.argv[2] ?? '';
const version = Object.hasOwn(bumps, arg) ? bumps[arg] : arg;
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) fail(`give patch, minor, major or a version like 1.2.3 (got "${arg}")`);
const tag = `v${version}`;

if (git('status', '--porcelain', '--untracked-files=no')) fail('commit or stash your changes first');
if (git('tag', '--list', tag)) fail(`${tag} already exists`);

// The notes are everything between "## [Unreleased]" and the next release heading.
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const heading = '## [Unreleased]';
const start = changelog.indexOf(heading);
if (start === -1) fail(`CHANGELOG.md has no "${heading}" section`);
const bodyStart = start + heading.length;
const end = changelog.indexOf('\n## ', bodyStart);
const rest = end === -1 ? '' : changelog.slice(end);
const notes = changelog.slice(bodyStart, end === -1 ? undefined : end).trim();
if (!notes) fail(`nothing under "${heading}" in CHANGELOG.md: write down what changed first`);

const now = new Date();
const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
writeFileSync('CHANGELOG.md', `${changelog.slice(0, bodyStart)}\n\n## [${version}] - ${date}\n\n${notes}\n${rest}`);

const setJson = (path, update) => {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  update(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
};
setJson('package.json', p => { p.version = version; });
setJson('apps/frontend/package.json', p => { p.version = version; });
setJson('package-lock.json', lock => {
  lock.version = version;
  lock.packages[''].version = version;
  lock.packages['apps/frontend'].version = version;
});

const replace = (path, pattern, replacement) => {
  const text = readFileSync(path, 'utf8');
  if (!pattern.test(text)) fail(`${path}: no version line to update`);
  writeFileSync(path, text.replace(pattern, replacement));
};
replace('apps/backend/Cargo.toml', /^version = ".*"$/m, `version = "${version}"`);
// The Docker build runs `cargo build --locked`, so the lock file must agree.
replace('Cargo.lock', /(name = "sheetor-backend"\nversion = )".*"/, `$1"${version}"`);

git('add', 'CHANGELOG.md', 'package.json', 'package-lock.json', 'apps/frontend/package.json', 'apps/backend/Cargo.toml', 'Cargo.lock');
git('commit', '-q', '-m', `release ${version}`);
// Verbatim, or git strips the notes' "### Added" headings as comments.
git('tag', '-a', tag, '--cleanup=verbatim', '-m', `Sheetor ${version}\n\n${notes}\n`);

console.log(`Tagged ${tag} (${current} -> ${version}). Nothing is pushed yet; publish it with:\n`);
console.log(`  git push origin ${git('branch', '--show-current')} --follow-tags\n`);
console.log(`Then open the repository's Releases page and create a release from ${tag}; \`git tag -n99 ${tag}\` prints its notes.`);
