import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
// The parent creates one private fixture directory inherited by test workers.
// A normal test run must never touch the user's saved login or playback progress.
if (!process.env.IQIYI_VOD_RUNTIME_DIR) {
  const directory = mkdtempSync(path.join(tmpdir(), 'iptv-iqiyi-vod-test-'))
  process.env.IQIYI_VOD_RUNTIME_DIR = directory
  process.on('exit', () => rmSync(directory, { recursive: true, force: true }))
}
