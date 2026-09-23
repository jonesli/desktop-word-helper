// 检查 ECDICT entries 表样例 + TOEIC 标签数量
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('assets/dict/_ecdict_x/ecdict.sqlite', { readOnly: true });
const sample = db.prepare("SELECT word, phonetic, translation, tag FROM entries WHERE tag LIKE '%TOEIC%' LIMIT 3").all();
console.log(JSON.stringify(sample, null, 1).slice(0, 700));
const n = db.prepare("SELECT COUNT(*) c FROM entries WHERE tag LIKE '%TOEIC%'").get();
console.log('TOEIC tagged:', n.c);
const n2 = db.prepare("SELECT COUNT(*) c FROM entries WHERE tag LIKE '%TOEIC%' AND phonetic != ''").get();
console.log('TOEIC with phonetic:', n2.c);
db.close();
