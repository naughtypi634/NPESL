const lessons = require('../../data/lessons.js');

function brief(item) {
  return {
    id: item.id,
    num: item.id,
    ipa: item.ipa,
    titleEn: item.titleEn,
    titleZh: item.titleZh,
    patterns: item.patterns
  };
}

Page({
  data: { groups: [] },

  onLoad() {
    this.setData({
      groups: [
        { name: '元音', items: lessons.filter((l) => l.num <= 20).map(brief) },
        { name: '辅音', items: lessons.filter((l) => l.num > 20).map(brief) }
      ]
    });
  },

  open(event) {
    const id = event.currentTarget.dataset.id;
    const lesson = lessons.find((l) => l.id === id);
    if (!lesson) return;
    wx.navigateTo({
      url: '/' + lesson.pkg + '/pages/lesson/lesson?id=' + id
    });
  }
});
