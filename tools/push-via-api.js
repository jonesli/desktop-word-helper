// 通过 GitHub REST API（Git Data API）推送仓库 —— 用于 git 直连被网络重置的环境
// 前提: gh CLI 已登录（取 token），远端仓库已存在且为空或需覆盖 main
// 用法: node tools/push-via-api.js <owner/repo>
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const https = require('https');

const REPO = process.argv[2];
if (!REPO) { console.error('usage: node tools/push-via-api.js owner/repo'); process.exit(1); }
const TOKEN = execSync('gh auth token', { encoding: 'utf8' }).trim();

function req(method, apiPath, body, tries = 5) {
  const payload = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const r = https.request({
        hostname: 'api.github.com', path: apiPath, method,
        family: 4,
        headers: {
          'User-Agent': 'push-via-api', Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + TOKEN,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        },
        timeout: 120000,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(text ? JSON.parse(text) : null); } catch { resolve(text); }
          } else if (res.statusCode >= 500 || res.statusCode === 429) {
            if (n < tries) { setTimeout(() => attempt(n + 1), 3000); return; }
            reject(new Error('HTTP ' + res.statusCode + ' ' + text.slice(0, 300)));
          } else reject(new Error('HTTP ' + res.statusCode + ' ' + text.slice(0, 300)));
        });
      });
      r.on('error', (e) => {
        if (n < tries) { setTimeout(() => attempt(n + 1), 3000); return; }
        reject(e);
      });
      if (payload) r.write(payload);
      r.end();
    };
    attempt(1);
  });
}

function listFiles(dir, base, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === 'shots') continue;
    const fp = path.join(dir, name);
    const rel = path.relative(base, fp).split(path.sep).join('/');
    if (fs.statSync(fp).isDirectory()) listFiles(fp, base, out);
    else out.push(rel);
  }
  return out;
}

const MESSAGE = `feat: 桌面背单词助手 v1.0.0 — Electron 桌面浮动条背单词应用

- 桌面置顶浮动条：滚动展示 / 直接展示（定时切换）两种模式
- 悬停详情卡（音标朗读、例句）、认识/不熟悉/收藏标记
- 七套词库：四六级、考研、托福、托业、雅思、GRE（共约4.9万词）
- 主题/字号/速度/透明度可调，隐藏发音选项
- 学习统计（连续打卡、近7天柱状图）、托盘常驻、全局快捷键、开机自启`;

(async () => {
  const root = path.join(__dirname, '..');

  // 0. 空仓库无法直接建 blob：先通过 contents API 写首个文件激活
  let parentSha = null;
  try {
    const ref = await req('GET', `/repos/${REPO}/git/ref/heads/main`);
    if (ref && ref.object) parentSha = ref.object.sha;
  } catch {}
  if (!parentSha) {
    console.log('empty repo -> bootstrap via contents API');
    const ig = fs.readFileSync(path.join(root, '.gitignore'));
    const r = await req('PUT', `/repos/${REPO}/contents/.gitignore`, {
      message: 'chore: init',
      content: ig.toString('base64'),
    });
    parentSha = r.commit.sha;
    console.log('bootstrapped, initial commit:', parentSha.slice(0, 8));
  }

  const files = listFiles(root, root);
  console.log('files:', files.length);

  // 1. blobs
  const tree = [];
  for (const rel of files) {
    const content = fs.readFileSync(path.join(root, rel));
    const b = await req('POST', `/repos/${REPO}/git/blobs`, { content: content.toString('base64'), encoding: 'base64' });
    tree.push({ path: rel, mode: '100644', type: 'blob', sha: b.sha });
    console.log('blob', rel, Math.round(content.length / 1024) + 'KB', b.sha.slice(0, 8));
  }

  // 2. tree
  const t = await req('POST', `/repos/${REPO}/git/trees`, { tree });
  console.log('tree:', t.sha.slice(0, 8));

  // 3. commit
  const parents = parentSha ? [parentSha] : [];
  const c = await req('POST', `/repos/${REPO}/git/commits`, { message: MESSAGE, tree: t.sha, parents });
  console.log('commit:', c.sha.slice(0, 8));

  // 4. 分支
  if (parents.length) {
    await req('PATCH', `/repos/${REPO}/git/refs/heads/main`, { sha: c.sha, force: true });
  } else {
    await req('POST', `/repos/${REPO}/git/refs`, { ref: 'refs/heads/main', sha: c.sha });
  }
  console.log('pushed to refs/heads/main');

  // 5. 校验
  const info = await req('GET', `/repos/${REPO}/branches/main`);
  console.log('VERIFY main ->', info.commit.sha.slice(0, 8));
  console.log('ALL DONE: https://github.com/' + REPO);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
