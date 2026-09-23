// 本地数据存储：设置 / 学习进度 / 统计（JSON 持久化，防抖写入）
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = {
  settings: {
    dict: 'CET4',          // 当前词库 key
    mode: 'scroll',        // scroll 滚动展示 | flash 直接展示（定时切换）
    staySec: 10,           // 直接展示模式下每个单词停留秒数
    speed: 55,             // 滚动速度 px/s
    order: 'rand',         // seq 顺序 | rand 随机
    skipKnown: true,       // 跳过已认识的词
    autoSpeak: false,      // 换词自动发音
    accent: 'us',          // us | uk
    hidePron: false,       // 隐藏发音：不显示音标，关闭朗读
    fontSize: 16,          // 浮动条字号
    theme: 'blue',         // blue | purple | green | orange | dark
    opacity: 0.92,         // 浮动条背景透明度 0.5~1
    dailyGoal: 50,         // 每日目标（个）
    autoStart: false,      // 开机自启
    pos: null,             // {x,y} 浮动条位置
  },
  progress: {},            // word -> { s: known|unknown|fav, n: 出现次数, t: 最近时间 }
  stats: { byDay: {}, shownTotal: 0, markedTotal: 0 },
};

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'config.json');
    this.data = this._load();
    this._saveTimer = null;
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        settings: { ...DEFAULTS.settings, ...(raw.settings || {}) },
        progress: raw.progress || {},
        stats: { ...DEFAULTS.stats, ...(raw.stats || {}) },
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
      } catch (e) {
        console.error('store save failed:', e.message);
      }
    }, 250);
  }

  get settings() { return this.data.settings; }

  updateSettings(patch) {
    Object.assign(this.data.settings, patch);
    this.save();
    return this.data.settings;
  }

  markWord(word, status) {
    const w = String(word || '').toLowerCase();
    if (!w) return;
    const p = this.data.progress[w] || { s: '', n: 0, t: 0 };
    if (status === 'fav') {
      p.s = p.s === 'fav' ? '' : 'fav';
    } else if (status === 'known' || status === 'unknown') {
      p.s = p.s === 'fav' ? 'fav' : status;
    }
    p.n += 1;
    p.t = Date.now();
    this.data.progress[w] = p;
    this.data.stats.markedTotal += 1;
    this._bumpDay().marked += 1;
    this.save();
    return p.s;
  }

  countShown(n = 1) {
    this.data.stats.shownTotal += n;
    this._bumpDay().shown += n;
    this.save();
  }

  _bumpDay() {
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const day = this.data.stats.byDay[key] || { shown: 0, marked: 0 };
    this.data.stats.byDay[key] = day;
    return day;
  }

  getStats() {
    const days = [];
    const d = new Date();
    for (let i = 6; i >= 0; i--) {
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const rec = this.data.stats.byDay[key] || { shown: 0, marked: 0 };
      days.push({ date: key, ...rec });
    }
    // 连续打卡：从今天（或昨天）往前数有学习记录的天数
    let streak = 0;
    for (let i = 0; i < 3650; i++) {
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const rec = this.data.stats.byDay[key];
      if (rec && (rec.shown > 0 || rec.marked > 0)) streak++;
      else if (i > 0) break;
    }
    const today = days[days.length - 1];
    const prog = Object.values(this.data.progress);
    return {
      days,
      streak,
      todayShown: today.shown,
      shownTotal: this.data.stats.shownTotal,
      markedTotal: this.data.stats.markedTotal,
      known: prog.filter((p) => p.s === 'known').length,
      unknown: prog.filter((p) => p.s === 'unknown').length,
      fav: prog.filter((p) => p.s === 'fav').length,
      touched: prog.length,
    };
  }

  resetProgress() {
    this.data.progress = {};
    this.data.stats = { byDay: {}, shownTotal: 0, markedTotal: 0 };
    this.save();
  }
}

module.exports = Store;
