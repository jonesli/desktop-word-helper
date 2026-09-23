// 学习队列：按词库 + 设置生成循环展示序列
const { loadDict } = require('./dicts');

class Engine {
  constructor(store) {
    this.store = store;
    this.words = [];
    this.queue = [];
    this.idx = 0;
  }

  setDict(key) {
    this.words = loadDict(key) || [];
    this.rebuild();
    return this.info();
  }

  rebuild() {
    const s = this.store.settings;
    let pool = this.words;
    if (s.skipKnown) {
      const filtered = pool.filter((w) => {
        const p = this.store.data.progress[String(w.word).toLowerCase()];
        return !p || p.s !== 'known';
      });
      if (filtered.length) pool = filtered; // 全部标记完则重新从头循环
    }
    const q = pool.map((_, i) => i);
    if (s.order === 'rand') {
      for (let i = q.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }
    }
    this.queue = q;
    if (this.idx >= q.length) this.idx = 0;
  }

  current() {
    if (!this.queue.length) return null;
    const wi = this.queue[this.idx % this.queue.length];
    return this.words[wi] || null;
  }

  next(count = true) {
    if (!this.queue.length) return null;
    this.idx = (this.idx + 1) % this.queue.length;
    // 一轮滚完（回到 0）时按最新进度重建队列（比如跳过新认识的词）
    if (this.idx === 0) this.rebuild();
    if (count) this.store.countShown(1);
    return this.current();
  }

  prev() {
    if (!this.queue.length) return null;
    this.idx = (this.idx - 1 + this.queue.length) % this.queue.length;
    return this.current();
  }

  info() {
    const cur = this.current();
    const stats = this.store.getStats();
    return {
      word: cur,
      index: this.queue.length ? this.idx + 1 : 0,
      total: this.queue.length,
      dictCount: this.words.length,
      todayShown: stats.todayShown,
      dailyGoal: this.store.settings.dailyGoal,
    };
  }
}

module.exports = Engine;
