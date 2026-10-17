import { execFile } from 'node:child_process'
// Decode 5 seconds at the beginning and near the end of a complete clear HLS with ffmpeg
// (formerly scripts/verify.py). ffmpeg is optional: without it the manifest-level checks
// (complete, unencrypted, full length, H.264 TS) stand alone and the result says so.
function run(args, { signal, timeout }) {
  return new Promise(resolve => {
    execFile('ffmpeg', args, { signal, timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') }))
  })
}
export async function decodeCheck(manifestPath, seconds, { signal } = {}) {
  const checks = []
  for (const [position, seek] of [['beginning', 0], ['near-end', Math.max(0, seconds - 20)]]) {
    const { error, stdout, stderr } = await run(['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
      '-ss', String(seek), '-i', manifestPath, '-t', '5', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], { signal, timeout: 45000 })
    if (error?.code === 'ENOENT') return { verified: true, skipped: true, checks: [] }
    if (signal?.aborted) throw Object.assign(new Error('解析已取消'), { code: 'UNAVAILABLE' })
    const values = Object.fromEntries(stdout.split('\n').filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
    const frames = Number(values.frame || 0), ok = !error && frames > 0 && Number(values.out_time_us || 0) >= 4000000
    checks.push({ position, seek, ok, frames, outTime: values.out_time, error: ok ? '' : (error?.killed ? 'decode timeout' : stderr.replace(/https?:\/\/\S+/g, '[media URL]').slice(-400)) })
  }
  return { verified: checks.every(check => check.ok), skipped: false, checks }
}
