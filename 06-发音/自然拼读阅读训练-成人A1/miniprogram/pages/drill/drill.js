const bank = require('../../data/bank.js');
const config = require('../../config');

const fs = wx.getFileSystemManager();
const AUDIO_ROOT = wx.env.USER_DATA_PATH + '/audio';
const AUDIO_BASE = (config.audioBase || '').replace(/\/+$/, '');

const CATS = [];
for (const q of bank) {
  if (CATS.indexOf(q.cat) === -1) CATS.push(q.cat);
}

function ensureDir(dir) {
  try {
    fs.accessSync(dir);
  } catch (err) {
    try {
      fs.mkdirSync(dir, true);
    } catch (e) {
      // 目录已存在或文件系统不可用，播放时再报错。
    }
  }
}

Page({
  data: {
    cats: [{ value: 'all', label: '全部' }].concat(
      CATS.map((cat) => ({ value: cat, label: cat }))
    ),
    cat: 'all',
    q: null,
    answers: [],
    revealed: false,
    playingKey: '',
    audioReady: Boolean(AUDIO_BASE)
  },

  onLoad() {
    this.deck = [];
    this.current = null;
    this.playingKey = '';
    ensureDir(AUDIO_ROOT);
    ensureDir(AUDIO_ROOT + '/f');
    ensureDir(AUDIO_ROOT + '/m');
  },

  onHide() {
    this.stopAudio();
  },

  onUnload() {
    this.stopAudio();
    if (this.audio) {
      this.audio.destroy();
      this.audio = null;
    }
  },

  selectCat(event) {
    const cat = event.currentTarget.dataset.value;
    if (cat === this.data.cat) return;
    this.stopAudio();
    this.deck = [];
    this.setData({ cat });
    this.showQuestion();
  },

  pool() {
    const cat = this.data.cat;
    return cat === 'all' ? bank : bank.filter((q) => q.cat === cat);
  },

  rebuildDeck() {
    const list = this.pool().slice();
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
    this.deck = list;
  },

  draw() {
    if (!this.deck.length) this.rebuildDeck();
    let q = this.deck.pop();
    if (this.deck.length && this.current && q === this.current) {
      const swap = this.deck.pop();
      this.deck.push(q);
      q = swap;
    }
    return q;
  },

  showQuestion() {
    this.stopAudio();
    const q = this.draw();
    this.current = q;
    this.setData({
      q: { zh: q.zh, scene: q.scene, cat: q.cat },
      answers: [],
      revealed: false
    });
  },

  reveal() {
    if (this.data.revealed || !this.current) return;
    this.setData({
      answers: this.current.answers.map((answer, index) => ({
        idx: index,
        num: (index < 9 ? '0' : '') + (index + 1),
        en: answer.en,
        note: answer.note,
        audio: answer.audio,
        fKey: 'f' + index,
        mKey: 'm' + index
      })),
      revealed: true
    });
  },

  ensureAudio() {
    if (this.audio) return this.audio;
    const audio = wx.createInnerAudioContext();
    audio.obeyMuteSwitch = false;
    audio.onEnded(() => this.markIdle());
    audio.onError(() => {
      this.markIdle();
      wx.showToast({ title: '发音没能播放', icon: 'none' });
    });
    this.audio = audio;
    return audio;
  },

  markIdle() {
    this.playingKey = '';
    if (this.data.playingKey) this.setData({ playingKey: '' });
  },

  stopAudio() {
    if (this.audio) {
      try {
        this.audio.stop();
      } catch (err) {
        // 还没加载过音频时 stop 会报错，忽略。
      }
    }
    this.markIdle();
  },

  cached(path) {
    try {
      fs.accessSync(path);
      return true;
    } catch (err) {
      return false;
    }
  },

  play(event) {
    const voice = event.currentTarget.dataset.voice;
    const index = Number(event.currentTarget.dataset.idx);
    const answer = this.data.answers[index];
    if (!answer) return;

    const key = voice + index;
    if (this.playingKey === key) {
      this.stopAudio();
      return;
    }

    if (!AUDIO_BASE || !wx.cloud) {
      wx.showToast({ title: '发音还没配置', icon: 'none' });
      return;
    }

    this.stopAudio();
    const audio = this.ensureAudio();
    this.playingKey = key;
    this.setData({ playingKey: key });

    const local = AUDIO_ROOT + '/' + voice + '/' + answer.audio + '.mp3';
    const start = (path) => {
      if (this.playingKey !== key) return;
      audio.src = path;
      audio.play();
    };

    if (this.cached(local)) {
      start(local);
      return;
    }

    wx.cloud
      .downloadFile({ fileID: AUDIO_BASE + '/audio/' + voice + '/' + answer.audio + '.mp3' })
      .then((res) => {
        let path = local;
        try {
          fs.saveFileSync(res.tempFilePath, path);
        } catch (err) {
          path = res.tempFilePath;
        }
        start(path);
      })
      .catch(() => {
        if (this.playingKey !== key) return;
        this.markIdle();
        wx.showToast({ title: '音频下载失败', icon: 'none' });
      });
  }
});
