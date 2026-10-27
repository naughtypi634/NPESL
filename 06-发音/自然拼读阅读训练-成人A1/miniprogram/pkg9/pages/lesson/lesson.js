const lessons = require('../../../data/lessons.js');

Page({
  data: { lesson: null },

  onLoad(query) {
    const lesson = lessons.find((l) => l.id === query.id) || null;
    this.setData({ lesson });
    if (lesson) {
      wx.setNavigationBarTitle({ title: lesson.titleEn });
    }
  }
});
