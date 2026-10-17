(() => {
  const root = document.getElementById('account-root')
  root.innerHTML = '<h2>爱奇艺账号</h2><p data-state role="status"></p><p><button data-action="check">检查登录</button><button data-action="start" hidden>本机官方网页登录</button><button data-action="close">关闭后台浏览器</button></p><textarea rows="3" autocomplete="off" spellcheck="false" placeholder="导入本人完整 Cookie 请求头或 Cookie JSON" aria-label="爱奇艺 Cookie" style="box-sizing:border-box;width:100%;padding:10px"></textarea><p><button data-action="import">验证并导入 Cookie</button></p><details open><summary>怎样导入 Cookie（NAS／Docker）</summary><ol style="line-height:1.8;padding-left:20px"><li>在自己的电脑用 Chrome 或 Edge 打开 <a href="https://www.iqiyi.com/" target="_blank" rel="noopener">爱奇艺官网</a>，登录本人账号。</li><li>按 F12（Mac 按 ⌥⌘I）打开开发者工具，切到「Network（网络）」，刷新页面。</li><li>点列表里任意一条 iqiyi.com 的请求，在「Request Headers（请求标头）」里找到 <code>Cookie</code>，复制它的完整值（很长，要包含 <code>P00001=</code>）。也可以用 Cookie 导出扩展导出 iqiyi.com 的 Cookie JSON。</li><li>粘贴到上面的输入框，点「验证并导入 Cookie」。显示账号有效即完成。</li></ol></details><small>影视和「爱奇艺体育」各用一份独立登录：在体育里导入过 Cookie，这里还要再导入一次。只修改影视模块的专用登录副本；校验失败保留原登录态；影视权益按每部视频单独核验，会员不代表所有内容都能看。凭据只存在服务端数据目录，不进配置备份；Cookie 过期后重新导入即可。服务装在有桌面的电脑上、从本机打开时，也可以用「本机官方网页登录」直接扫码。</small>'
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
