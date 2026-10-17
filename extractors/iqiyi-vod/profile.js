import { mkdir, copyFile, chmod } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
// Never launch the source profile. SQLite backup reads a consistent cookie snapshot
// even when the owner's Chromium is running; no cookie values leave this function.
export async function cloneProfile(source, destination) {
  await mkdir(destination, { recursive: true, mode: 0o700 })
  for (const name of ['Local State', 'Default/Preferences', 'Default/Secure Preferences']) {
    const target = path.join(destination, name)
    try { await mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); await copyFile(path.join(source, name), target); await chmod(target, 0o600) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  await exec('python3', ['-c', `import pathlib,sqlite3,sys,os
src=pathlib.Path(sys.argv[1]);dest=pathlib.Path(sys.argv[2])
for name in ['Default/Cookies','Default/Network/Cookies']:
 p=src/name
 if p.exists():
  q=dest/name;q.parent.mkdir(parents=True,exist_ok=True)
  with sqlite3.connect(p.as_uri()+'?mode=ro',uri=True) as a,sqlite3.connect(q) as b:a.backup(b)
  q.chmod(0o600)
`, source, destination], { timeout: 15000, maxBuffer: 4096 })
}
