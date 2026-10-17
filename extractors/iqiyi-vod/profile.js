import { mkdir, copyFile, chmod, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
// Never launch the source profile. A SQLite snapshot (VACUUM INTO on a read-only
// connection) reads a consistent cookie database even while the owner's Chromium is
// running; no cookie values leave this function. Node's built-in sqlite replaces the
// former python3 helper, so the image needs no Python.
export async function copyCookies(source, destination) {
  for (const name of ['Default/Cookies', 'Default/Network/Cookies']) {
    const from = path.join(source, name)
    if (!existsSync(from)) continue
    const to = path.join(destination, name)
    await mkdir(path.dirname(to), { recursive: true, mode: 0o700 })
    await rm(to, { force: true })
    let sqlite
    try { sqlite = await import('node:sqlite') } catch { /* Node without node:sqlite */ }
    if (sqlite) {
      // A failed snapshot (e.g. a busy database) is an error, never a raw copy of a live file.
      const db = new sqlite.DatabaseSync(from, { readOnly: true })
      try { db.exec(`VACUUM INTO '${to.replaceAll("'", "''")}'`) } finally { db.close() }
    } else {
      // The login browser is closed after every login or import, so the file is settled.
      await copyFile(from, to)
    }
    await chmod(to, 0o600)
  }
}
export async function cloneProfile(source, destination) {
  await mkdir(destination, { recursive: true, mode: 0o700 })
  for (const name of ['Local State', 'Default/Preferences', 'Default/Secure Preferences']) {
    const target = path.join(destination, name)
    try { await mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); await copyFile(path.join(source, name), target); await chmod(target, 0o600) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  await copyCookies(source, destination)
}
