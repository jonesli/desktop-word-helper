// 验证浮动条悬停展开/迟滞收起逻辑：合成 MouseEvent 驱动
// 用法: node tools/test-hover.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 800, height: 500, webPreferences: {
    preload: path.join(__dirname, '..', 'src', 'preload', 'preload.js'),
    contextIsolation: true,
  } });
  w.webContents.on('console-message', (_e, _lv, msg) => console.log('RENDERER:', msg));
  await w.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'float.html'));
  await w.webContents.executeJavaScript('void 0'); // 等待渲染稳定

  const results = await w.webContents.executeJavaScript(`(async () => {
    const out = [];
    const $ = (id) => document.getElementById(id);
    const fire = (el, type) => el.dispatchEvent(new MouseEvent(type, { bubbles: type === 'mouseleave' }));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const expanded = () => document.body.classList.contains('expanded');

    // 1. 悬停浮动条 → 展开
    fire($('bar'), 'mouseenter');
    await sleep(30);
    out.push(['hover bar -> expanded', expanded()]);

    // 2. 模拟指针在窗口尺寸扩大完成前短暂越界：leave 后立刻回来
    fire(document.body, 'mouseleave');
    fire(document.body, 'mouseenter');
    await sleep(400); // 超过 350ms 宽限期
    out.push(['leave+re-enter within grace -> stays expanded', expanded()]);

    // 3. 移入卡片后短暂越界再回来（用户报障场景）
    fire($('card'), 'mouseenter');
    fire(document.body, 'mouseleave');
    await sleep(100); // 小于宽限期
    fire(document.body, 'mouseenter');
    await sleep(400);
    out.push(['leave card, back within 100ms -> stays expanded', expanded()]);

    // 4. 真正移出 -> 宽限期后收起
    fire(document.body, 'mouseleave');
    await sleep(450);
    out.push(['leave for good -> collapsed', !expanded()]);
    return out;
  })()`);
  let pass = true;
  for (const [name, ok] of results) {
    console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name);
    if (!ok) pass = false;
  }
  console.log(pass ? 'ALL PASS' : 'HAS FAILURES');
  app.exit(pass ? 0 : 1);
});
