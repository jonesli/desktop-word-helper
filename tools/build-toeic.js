// 构建 TOEIC 词库：HuggingFace toeic-vocab-tw（词汇/释义/例句，繁体）→ opencc-js 转简体；ECDICT sqlite 补音标
// 用法: node tools/build-toeic.js
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const OpenCC = require('opencc-js');

const DICT_DIR = path.join(__dirname, '..', 'assets', 'dict');
const HF_SRC = path.join(DICT_DIR, '_toeic_hf.json');
const OUT = path.join(DICT_DIR, 'TOEIC.json');
const ECDICT_DB = path.join(DICT_DIR, '_ecdict_x', 'ecdict.sqlite');

const POS_MAP = {
  verb: 'v', noun: 'n', adjective: 'adj', adverb: 'adv', phrase: 'phr',
  preposition: 'prep', conjunction: 'conj', pronoun: 'pron', interjection: 'interj',
};

// 繁(TW)→简（含台湾词汇转大陆词汇，如 專案→项目、程式→程序）+ 直角引号转弯引号
const converter = OpenCC.Converter({ from: 'twp', to: 'cn' });
const t2s = (s) => converter(String(s || ''))
  .replace(/「|」/g, (c) => ({ '「': '“', '」': '”' }[c]))
  .replace(/『|』/g, (c) => ({ '『': '‘', '』': '’' }[c]));

function loadAllPhonetics() {
  const map = new Map();
  if (!fs.existsSync(ECDICT_DB)) return map;
  const db = new DatabaseSync(ECDICT_DB, { readOnly: true });
  const rows = db.prepare("SELECT word, phonetic FROM entries WHERE phonetic != ''").all();
  db.close();
  for (const r of rows) {
    const p = String(r.phonetic || '').replace(/^\/+|\/+$/g, '').trim();
    if (p && !map.has(r.word.toLowerCase())) map.set(r.word.toLowerCase(), p);
  }
  return map;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(HF_SRC, 'utf8'));
  console.log('hf entries:', data.length);

  const words = [];
  const seen = new Set();
  let skippedPhrase = 0;
  for (const e of data) {
    const w = String(e.english_word || '').trim();
    if (!/^[A-Za-z][A-Za-z'-]*$/.test(w)) { skippedPhrase++; continue; } // 跳过短语型词条
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    const tran = t2s(e.chinese_definition).trim();
    if (!tran) continue;
    seen.add(key);
    const pos = (e.parts_of_speech && e.parts_of_speech[0] && POS_MAP[e.parts_of_speech[0]]) || '';
    const sentences = (e.examples || []).slice(0, 2)
      .map((s) => ({ en: String(s.english || '').trim(), cn: t2s(s.chinese).trim() }))
      .filter((s) => s.en && s.cn);
    words.push({ word: w, pos, tran, sentences });
  }
  console.log('single-word entries:', words.length, '| phrases skipped:', skippedPhrase);

  const phon = loadAllPhonetics();
  console.log('ecdict phonetics loaded:', phon.size);
  const matched = words.filter((w) => phon.has(w.word.toLowerCase())).length;
  console.log('phonetics matched:', matched, '/', words.length);

  const out = words.map((w) => ({
    word: w.word,
    us: '',
    uk: phon.get(w.word.toLowerCase()) || '',
    trans: [{ pos: w.pos, tran: w.tran }],
    sentences: w.sentences,
    exam: [],
  }));
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('TOEIC.json:', out.length, 'words,', (fs.statSync(OUT).size / 1048576).toFixed(1) + 'MB');
  console.log('sample:', JSON.stringify(out.find((w) => w.uk)));

  // 更新 index.json：插到托福之后
  const idxPath = path.join(DICT_DIR, 'index.json');
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  idx.TOEIC = { name: '托业词汇', count: out.length, file: 'TOEIC.json' };
  const ordered = {};
  for (const k of ['CET4', 'CET6', 'KaoYan', 'TOEFL', 'TOEIC', 'IELTS', 'GRE']) if (idx[k]) ordered[k] = idx[k];
  fs.writeFileSync(idxPath, JSON.stringify(ordered, null, 2));
  console.log('index:', Object.keys(ordered).join(','));
  console.log('ALL DONE');
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
