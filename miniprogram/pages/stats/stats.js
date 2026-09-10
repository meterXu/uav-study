Page({
  data: {
    totalRounds: 0,
    totalQuestions: 0,
    avgAccuracy: '--%',
    rounds: [],
  },

  onShow() {
    this.loadStats();
  },

  loadStats() {
    let rounds = [];
    try {
      rounds = wx.getStorageSync('practiceRounds') || [];
      if (!Array.isArray(rounds)) rounds = [];
    } catch (e) {}

    const totalRounds = rounds.length;
    const totalQuestions = rounds.reduce((s, r) => s + (r.total || 0), 0);
    const totalCorrect = rounds.reduce((s, r) => s + (r.correct || 0), 0);
    const avgAccuracy = totalQuestions > 0
      ? Math.round((totalCorrect / totalQuestions) * 100) + '%'
      : '--%';

    const display = rounds.map((r) => ({
      id: r.id,
      mode: r.mode,
      total: r.total,
      correct: r.correct,
      accuracy: r.accuracy,
      time: r.time,
      duration: this.formatDuration(r.durationSec),
    }));

    this.setData({ totalRounds, totalQuestions, avgAccuracy, rounds: display });
  },

  formatDuration(sec) {
    if (!sec || sec < 0) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? m + '分' + s + '秒' : s + '秒';
  },
});