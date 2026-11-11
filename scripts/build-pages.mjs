import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(workspace, 'artifacts/pages');
// Only remove this generated directory, never a caller-provided path.
if (!output.startsWith(workspace + sep) || dirname(output) !== resolve(workspace, 'artifacts')) {
  throw new Error('Pages output must remain inside this workspace.');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(workspace, 'apps/kerala-news'), output, { recursive: true });
await cp(resolve(workspace, 'apps/malayalam-tv'), resolve(output, 'malayalam-tv'), { recursive: true });
await writeFile(resolve(output, '.nojekyll'), '');
console.log(`GitHub Pages files: ${output}`);
