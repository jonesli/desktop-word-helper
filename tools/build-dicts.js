// 下载 kajweb/dict 词库 zip（经 ghproxy 镜像），解压并转换为应用统一格式
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const DICT_DIR = path.join(__dirname, '..', 'assets', 'dict');
const TMP = path.join(DICT_DIR, '_raw');

// kajweb/dict book/ 目录下的分块 zip（按序合并）
const DICTS = [
  { key: 'CET4', name: '大学英语四级', parts: ['1521164649209_CET4_1.zip', '1521164635506_CET4_2.zip', '1521164643060_CET4_3.zip'] },
  { key: 'CET6', name: '大学英语六级', parts: ['1521164668667_CET6_1.zip', '1524052554766_CET6_2.zip', '1521164633851_CET6_3.zip'] },
  { key: 'KaoYan', name: '考研英语', parts: ['1521164669833_KaoYan_1.zip', '1521164654696_KaoYan_2.zip', '1521164658897_KaoYan_3.zip'] },
  { key: 'TOEFL', name: '托福词汇', parts: ['1521164640451_TOEFL_2.zip', '1521164667985_TOEFL_3.zip'] },
  { key: 'IELTS', name: '雅思词汇', parts: ['1521164657744_IELTS_2.zip', '1521164666922_IELTS_3.zip'] },
  { key: 'GRE', name: 'GRE词汇', parts: ['1521164637271_GRE_2.zip', '1521164677706_GRE_3.zip'] },
];

function fetch(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, { family: 4 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetch(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' ' + url)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function unzip(zipPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force"`, { stdio: 'pipe' });
  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const fp = path.join(d, f);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else files.push(fp);
    }
  })(outDir);
  return files;
}

function convertEntry(e) {
  const wc = (e.content && e.content.word && e.content.word.content) || {};
  const trans = (wc.trans || []).map((t) => ({ pos: t.pos || '', tran: t.tranCn || t.tran || '' }))
    .filter((t) => t.tran);
  const normSent = (s) => {
    const inner = (s.sentences && s.sentences[0]) || {};
    return { en: inner.sContent || '', cn: inner.sCn || '' };
  };
  const sentences = ((wc.sentence && wc.sentence.sentences) || []).slice(0, 2).map(normSent).filter((s) => s.en);
  const examArr = ((wc.realExamSentence && wc.realExamSentence.sentences) || []).slice(0, 1)
    .map((s) => {
      const si = s.sourceInfo || {};
      return { en: s.sContent || '', src: [si.year, si.type].filter(Boolean).join(' ') };
    }).filter((s) => s.en);
  return { word: e.headWord || '', us: wc.usphone || '', uk: wc.ukphone || '', trans, sentences, exam: examArr };
}

function parseJsonl(buf) {
  const text = buf.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text);
  return text.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const index = {};
  for (const dict of DICTS) {
    const outPath = path.join(DICT_DIR, dict.key + '.json');
    if (fs.existsSync(outPath)) { console.log('skip', dict.key); }
    else {
      const seen = new Map();
      for (const part of dict.parts) {
        const zipPath = path.join(TMP, part);
        if (!fs.existsSync(zipPath)) {
          const url = 'https://ghproxy.net/https://raw.githubusercontent.com/kajweb/dict/master/book/' + part;
          console.log('downloading', part);
          fs.writeFileSync(zipPath, await fetch(url));
        }
        const outDir = path.join(TMP, '_x_' + part.replace(/\.zip$/, ''));
        if (!fs.existsSync(outDir)) unzip(zipPath, outDir);
        const files = unzipscan(outDir);
        for (const f of files) {
          if (!/\.json$/i.test(f)) continue;
          for (const e of parseJsonl(fs.readFileSync(f))) {
            const w = convertEntry(e);
            if (w.word && w.trans.length && !seen.has(w.word.toLowerCase())) seen.set(w.word.toLowerCase(), w);
          }
        }
      }
      const words = [...seen.values()];
      fs.writeFileSync(outPath, JSON.stringify(words));
      console.log(dict.key, dict.name, words.length, 'words,', (fs.statSync(outPath).size / 1048576).toFixed(1) + 'MB');
    }
    index[dict.key] = { name: dict.name, count: JSON.parse(fs.readFileSync(outPath, 'utf8')).length, file: dict.key + '.json' };
  }
  fs.writeFileSync(path.join(DICT_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log('ALL DONE');
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });

function unzipscan(dir) {
  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const fp = path.join(d, f);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else files.push(fp);
    }
  })(dir);
  return files;
}
