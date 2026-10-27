Component({
  properties: {
    lesson: { type: Object, value: null }
  },

  data: {
    voice: 'f',
    mode: '',
    activeChunk: '',
    activeSentence: -1,
    failed: false
  },

  lifetimes: {
    attached() {
      if (wx.setInnerAudioOption) {
        wx.setInnerAudioOption({ obeyMuteSwitch: false, mixWithOther: true });
      }
      const audio = wx.createInnerAudioContext();
      audio.autoplay = false;
      audio.obeyMuteSwitch = false;
      audio.src = this.data.lesson.audioF;
      audio.onEnded(() => this.reset());
      audio.onError(() => {
        this.reset();
        this.setData({ failed: true });
      });
      this.audio = audio;
    },

    detached() {
      this.reset();
      if (this.audio) {
        this.audio.destroy();
        this.audio = null;
      }
    }
  },

  pageLifetimes: {
    hide() {
      this.reset();
    }
  },

  methods: {
    reset() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.stopAt = null;
      this.seq = (this.seq || 0) + 1;
      if (this.audio) this.audio.stop();
      if (this.data.mode || this.data.activeChunk || this.data.activeSentence !== -1) {
        this.setData({ mode: '', activeChunk: '', activeSentence: -1 });
      }
    },

    span(item, kind) {
      return item[kind + (this.data.voice === 'f' ? 'F' : 'M')];
    },

    setVoice(event) {
      const voice = event.currentTarget.dataset.voice;
      if (voice === this.data.voice) return;
      this.reset();
      this.setData({ voice });
      if (this.audio) {
        const lesson = this.data.lesson;
        this.audio.src = voice === 'f' ? lesson.audioF : lesson.audioM;
      }
    },

    play(start, end, mode, chunkKey, sentenceIndex) {
      const audio = this.audio;
      if (!audio) return;
      this.reset();
      const token = this.seq;
      this.stopAt = end == null ? null : end;
      this.setData({
        mode,
        activeChunk: chunkKey || '',
        activeSentence: sentenceIndex == null ? -1 : sentenceIndex,
        failed: false
      });
      audio.pause();
      audio.seek(start);
      setTimeout(() => {
        if (this.seq !== token) return;
        audio.play();
        this.tick(token);
      }, 40);
    },

    tick(token) {
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (this.seq !== token) return;
        const audio = this.audio;
        if (!audio) return;
        const time = audio.currentTime;
        if (typeof time !== 'number') return;
        this.highlight(time);
        if (this.stopAt != null && time >= this.stopAt - 0.02) {
          this.reset();
          return;
        }
        if (this.stopAt == null && audio.duration && time >= audio.duration - 0.08) {
          this.reset();
        }
      }, 50);
    },

    highlight(time) {
      if (this.data.mode !== 'all' && this.data.mode !== 'sentence') return;
      const sentences = this.data.lesson.sentences;
      let si = -1;
      let key = '';
      for (let i = 0; i < sentences.length; i += 1) {
        if (time + 0.001 < this.span(sentences[i], 'start')) break;
        si = i;
        const chunks = sentences[i].chunks;
        for (let j = 0; j < chunks.length; j += 1) {
          if (time + 0.001 >= this.span(chunks[j], 'start')) key = i + '-' + j;
        }
      }
      if (si !== this.data.activeSentence || key !== this.data.activeChunk) {
        this.setData({ activeSentence: si, activeChunk: key });
      }
    },

    toggleAll() {
      if (this.data.mode === 'all') {
        this.reset();
        return;
      }
      this.play(0, null, 'all', '', -1);
    },

    playSentence(event) {
      const si = Number(event.currentTarget.dataset.si);
      const sentence = this.data.lesson.sentences[si];
      if (!sentence) return;
      this.play(
        this.span(sentence, 'start'),
        this.span(sentence, 'end'),
        'sentence',
        '',
        si
      );
    },

    playChunk(event) {
      const si = Number(event.currentTarget.dataset.si);
      const ci = Number(event.currentTarget.dataset.ci);
      const sentence = this.data.lesson.sentences[si];
      const chunk = sentence && sentence.chunks[ci];
      if (!chunk) return;
      this.play(
        this.span(chunk, 'start'),
        this.span(chunk, 'end'),
        'chunk',
        si + '-' + ci,
        -1
      );
    }
  }
});
