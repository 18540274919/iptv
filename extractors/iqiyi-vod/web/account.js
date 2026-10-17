(() => {
  const root = document.getElementById('account-root')
  root.innerHTML = '<h2>爱奇艺账号</h2><p data-state role="status"></p><p><button data-action="check">检查登录</button><button data-action="start" hidden>本机官方网页登录</button><button data-action="close">关闭后台浏览器</button></p><textarea rows="3" autocomplete="off" spellcheck="false" placeholder="导入本人完整 Cookie 请求头或 Cookie JSON" aria-label="爱奇艺 Cookie" style="box-sizing:border-box;width:100%;padding:10px"></textarea><p><button data-action="import">验证并导入 Cookie</button></p><small>NAS／Docker：在自己的电脑登录官网后复制 Cookie 导入。只修改影视模块的专用登录副本；校验失败保留原登录态，影视权益按每部视频单独核验。</small>'
  const message = root.querySelector('[data-state]'), input = root.querySelector('textarea')
  async function status() {
    const response = await fetch('./api/account'), state = await response.json()
    if (!response.ok) throw Error(state.error || '登录状态暂不可用')
    message.textContent = state.authenticated ? state.message : state.hasSavedLogin ? '已有独立登录副本，播放时按官网实际权益核验。' : state.message
    root.querySelector('[data-action="start"]').hidden = !state.available || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  }
  root.addEventListener('click', async event => {
    const action = event.target.dataset.action
    if (!action) return
    const buttons = [...root.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true)
    message.textContent = '正在处理，请稍候…'
    try {
      const response = await fetch('./api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(action === 'import' ? { cookies: input.value } : {}) }) })
      const state = await response.json()
      if (!response.ok) throw Error(state.error || '账号操作未完成')
      if (action === 'import') input.value = ''
      message.textContent = state.message
    } catch (error) { message.textContent = error.message }
    finally { buttons.forEach(b => b.disabled = false) }
  })
  status().catch(error => message.textContent = error.message)
})()
