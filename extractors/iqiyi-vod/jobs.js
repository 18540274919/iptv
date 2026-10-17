import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
let queue = Promise.resolve()
export function browserJob(script, options) {
  const task = queue.catch(() => {}).then(() => {
    if (options.signal?.aborted) throw new DOMException('Job cancelled', 'AbortError')
    return exec(process.execPath, [script], options)
  })
  queue = task.catch(() => {})
  return task
}
