// Unknown is deliberately hidden. A free/paid catalog label never proves that the
// official player grants this account a complete, usable stream.
// An expired verdict keeps applying for a grace period until its recheck lands (official
// pages take longer than the refresh wait, and every filter() re-queues expired items).
// A failed or refused recheck replaces it, so an unanswered probe still hides the item.
//
// Every probe opens a full official player page in Chromium (issue #182: two busy
// renderers pegged NAS CPUs). So verdicts last long, unanswered probes back off, and
// the module is re-run only when the list it would publish actually changes.
export const TTL = {
  live: 20 * 60 * 1000,             // rights rarely change mid-match; a refused playback hides at once
  liveDenied: 60 * 60 * 1000,       // a paid room stays paid until the login changes, which resets everything
  vodAllowed: 6 * 60 * 60 * 1000,
  vodDenied: 2 * 60 * 60 * 1000,
  unknown: 5 * 60 * 1000,           // doubles per consecutive miss, up to unknownMax
  unknownMax: 60 * 60 * 1000,
  playbackUnknown: 60 * 1000,       // a failed play attempt is retried by the viewer, not backed off
}
export const STALE_GRACE_MS = 30 * 60 * 1000
const NOTIFY_THROTTLE_MS = 60 * 1000
// A box where every official page times out (weak CPU, no route to iQiyi) would otherwise
// keep a renderer busy forever for an empty list: after a run of timeouts, stop for a while.
export const BREAKER = { misses: 4, pauseMs: 30 * 60 * 1000 }

// A whole sweep of replays would otherwise expire in the same minute; spread them
// deterministically by id (±10%) so rechecks trickle in instead of bursting.
function spread(id, ms) {
  let hash = 0
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return Math.round(ms * (0.9 + (hash % 201) / 1000))
}
function ttlFor(item, status, misses = 0) {
  if (status === 'unknown') return Math.min(TTL.unknown * 2 ** Math.max(0, misses - 1), TTL.unknownMax)
  if (!item.kind) return status === 'allowed' ? TTL.live : TTL.liveDenied
  return spread(item.id, status === 'allowed' ? TTL.vodAllowed : TTL.vodDenied)
}

export function createEligibility({ probe, now = Date.now, onUpdate = () => {}, isPaused = () => false,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)), concurrency = 1 } = {}) {
  // labels keeps the last probed viewing label apart from the verdict: playback can
  // confirm access after an expired or failed record, but cannot tell anonymous from paid.
  const records = new Map(), labels = new Map(), queue = new Map(), inFlight = new Set()
  let generation = 0, running, activated = false, closed = false, lastNotice = -Infinity
  // What the last filter() call handed to the playlist; background results that leave it
  // unchanged must not re-run the module (each re-run regenerates the whole playlist).
  // awaitingFilter: a re-run was requested and has not reached filter() yet. If it never does
  // (module switched off, catalog failing, merged into a run already past filter), asking again
  // would rebuild the playlist every minute for nothing; the next scheduled refresh catches up.
  let lastItems = [], published = '', awaitingFilter = false, streak = 0, pausedUntil = 0
  function notify(force = false) {
    if (!force && now() - lastNotice < NOTIFY_THROTTLE_MS) return false
    lastNotice = now()
    Promise.resolve().then(() => { if (!closed) return onUpdate() }).catch(() => {})
    return true
  }
  function publishIfChanged(force) {
    if (!awaitingFilter && signature(classify(lastItems)) !== published && notify(force)) awaitingFilter = true
  }
  function classify(items) {
    const allowed = [], skipped = [], unknown = []
    for (const item of items) {
      const record = records.get(item.id)
      const current = record?.expires + STALE_GRACE_MS > now()
      if (current && record.status === 'allowed') allowed.push({ ...item, accessLabel: record.accessLabel || '权益已授权' })
      else if (current && record.status === 'denied') skipped.push({ ref: `iqiyi-sports-${item.id}`, reason: record.reason })
      else unknown.push(item.id)
    }
    return { allowed, skipped, unknown }
  }
  const signature = ({ allowed, skipped }) => JSON.stringify([allowed.map(i => [i.id, i.accessLabel]), skipped.map(s => s.ref)])
  function kick() {
    if (running || closed || !queue.size || now() < pausedUntil) return running
    const epoch = generation
    running = (async () => {
      while (queue.size && !closed && epoch === generation) {
        if (isPaused()) { await delay(250); continue }
        const batch = [...queue.values()].sort((a, b) => Number(!!a.kind) - Number(!!b.kind)).slice(0, concurrency)
        for (const item of batch) { queue.delete(item.id); inFlight.add(item.id) }
        const previous = batch.map(item => records.get(item.id))
        const results = await Promise.allSettled(batch.map(probe))
        for (const item of batch) inFlight.delete(item.id)
        if (closed || epoch !== generation) return
        for (let i = 0; i < batch.length; i++) {
          const item = batch[i], result = results[i]
          if (records.get(item.id) !== previous[i]) continue
          const state = result.status === 'fulfilled' ? result.value : { status: 'unknown', reason: '官方权限核验未完成，请稍后重试' }
          const misses = state.status === 'unknown' ? (previous[i]?.status === 'unknown' ? previous[i].misses || 1 : 0) + 1 : 0
          records.set(item.id, { ...state, misses, expires: now() + ttlFor(item, state.status, misses) })
          if (state.status === 'allowed' && state.accessLabel) labels.set(item.id, state.accessLabel)
          streak = state.status === 'unknown' ? streak + 1 : 0
        }
        const tripped = streak >= BREAKER.misses
        if (tripped) { streak = 0; pausedUntil = now() + BREAKER.pauseMs }
        publishIfChanged(!queue.size || tripped)
        if (tripped) break
        if (queue.size) await delay(250)
      }
      // The queue can also empty through record() (playback) while a change was throttled.
      if (!closed && epoch === generation) publishIfChanged(true)
    })().finally(() => { running = undefined; if (queue.size && !closed) kick() })
    return running
  }
  return {
    async filter(items, { waitMs = 5000 } = {}) {
      activated = true; awaitingFilter = false
      const wanted = new Set(items.map(item => item.id))
      for (const id of records.keys()) if (!wanted.has(id)) records.delete(id)
      for (const id of labels.keys()) if (!wanted.has(id)) labels.delete(id)
      for (const id of queue.keys()) if (!wanted.has(id)) queue.delete(id)
      for (const item of items) if (!(records.get(item.id)?.expires > now()) && !inFlight.has(item.id)) queue.set(item.id, item)
      const task = kick()
      let timer
      if (task && waitMs > 0) {
        try { await Promise.race([task, new Promise(resolve => { timer = setTimeout(resolve, waitMs) })]) }
        finally { clearTimeout(timer) }
      }
      const result = classify(items)
      lastItems = items; published = signature(result)
      const warnings = result.unknown.length ? [`${result.unknown.length} 条爱奇艺内容尚未确认完整播放权限，暂不显示；后台会继续核验`] : []
      if (now() < pausedUntil) warnings.unshift(`爱奇艺官方页面连续 ${BREAKER.misses} 次没有响应（设备较慢或连不上爱奇艺），后台核验暂停约 ${Math.ceil((pausedUntil - now()) / 60000)} 分钟后再试`)
      return { items: result.allowed, skipped: result.skipped, unknown: result.unknown.length, warnings }
    },
    record(item, status, reason = '') {
      activated = true
      const changed = records.get(item.id)?.status !== status
      // Without the probed label a free room being watched would turn into 「权益已授权」.
      records.set(item.id, { status, reason, accessLabel: status === 'allowed' ? labels.get(item.id) : undefined,
        expires: now() + (status === 'unknown' ? TTL.playbackUnknown : ttlFor(item, status)) })
      queue.delete(item.id)
      if (changed) notify(true)
    },
    // requeue (account changed): check the last list right away, because the re-run requested
    // here may merge into a run that already passed filter() and leave the list empty until the
    // next refresh. Plain cache clears (settings saved, backup imported) wait for that refresh.
    reset({ requeue = false } = {}) {
      generation++; records.clear(); labels.clear(); queue.clear(); inFlight.clear(); streak = 0; pausedUntil = 0; lastNotice = now()
      if (!activated) return
      if (requeue) for (const item of lastItems) queue.set(item.id, item)
      awaitingFilter = notify(true); kick()
    },
    async shutdown() { closed = true; generation++; queue.clear(); await running },
  }
}
