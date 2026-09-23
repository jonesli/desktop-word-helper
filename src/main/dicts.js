// 词库加载：读取 assets/dict 下的词书 JSON 与索引
const path = require('path');
const fs = require('fs');

const DICT_DIR = path.join(__dirname, '..', '..', 'assets', 'dict');

function getIndex() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(DICT_DIR, 'index.json'), 'utf8'));
    return Object.entries(idx)
      .map(([key, meta]) => ({ key, name: meta.name, count: meta.count, file: meta.file }));
  } catch {
    return [];
  }
}

const cache = new Map();

function loadDict(key) {
  if (cache.has(key)) return cache.get(key);
  const idx = getIndex();
  const meta = idx.find((d) => d.key === key) || idx[0];
  if (!meta) return null;
  const words = JSON.parse(fs.readFileSync(path.join(DICT_DIR, meta.file), 'utf8'));
  cache.set(key, words);
  return words;
}

module.exports = { getIndex, loadDict, DICT_DIR };
