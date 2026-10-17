import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getBrowserPool } from '../../utils/browserLauncher.js'
const exec = promisify(execFile)
let queue = Promise.resolve()
// Each job script starts its own Chromium in a child process. Hold a slot of the shared
// browser pool (mbrowserConcurrency) for the job, so these count against the same limit as
// every other module's browser instead of running alongside them (#182).
export function browserJob(script, options) {
  const task = queue.catch(() => {}).then(async () => {
    if (options.signal?.aborted) throw new DOMException('Job cancelled', 'AbortError')
    const slot = await getBrowserPool().acquire({ label: '爱奇艺影视', waitMs: 90000 })
    try { return await exec(process.execPath, [script], options) } finally { slot.release() }
  })
  queue = task.catch(() => {})
  return task
}
