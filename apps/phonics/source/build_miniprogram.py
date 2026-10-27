# -*- coding: utf-8 -*-
"""Generate the WeChat Mini Program from the built lesson pages.

Reads lessons/*.html (which already carry computed chunk timings for both
voices), lifts the text, translations and timestamps into data/lessons.js, and
copies each story-f.mp3 / story-m.mp3 into a subpackage so the whole app works
offline.

Run from anywhere:  python -I source/build_miniprogram.py
"""

import html
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).parent
BASE = ROOT.parent
LESSONS_DIR = BASE / "lessons"
AUDIO_DIR = ROOT / "audio"
OUT = BASE / "miniprogram"

APPID = "wxfb269884c0f1df20"
PER_PACKAGE = 5
MAX_PACKAGE_BYTES = 1_900_000

TITLE_RE = re.compile(r"<h1>(.*?)</h1>", re.S)
ZH_RE = re.compile(r'<p class="title-zh">(.*?)</p>', re.S)
IPA_RE = re.compile(r'<span class="phoneme">(.*?)</span>', re.S)
PATTERNS_RE = re.compile(r'<span class="patterns">(.*?)</span>', re.S)
SECTION_RE = re.compile(
    r'<section class="sentence" data-start-f="([\d.]+)" data-end-f="([\d.]+)" '
    r'data-start-m="([\d.]+)" data-end-m="([\d.]+)">'
)
CHUNK_RE = re.compile(
    r'<button class="chunk"[^>]*data-start-f="([\d.]+)" data-end-f="([\d.]+)" '
    r'data-start-m="([\d.]+)" data-end-m="([\d.]+)">'
    r"(.*?)</button>\s*<p class=\"zh\">(.*?)</p>",
    re.S,
)
VOICES = ("f", "m")
SOUND_RE = re.compile(r'<span class="sound">(.*?)</span>', re.S)


def parts_of(markup):
    parts = []
    for index, piece in enumerate(SOUND_RE.split(markup)):
        if not piece:
            continue
        text = html.unescape(piece)
        if index % 2 == 1:
            parts.append({"t": text, "s": 1})
        else:
            parts.append({"t": text, "s": 0})
    for index, part in enumerate(parts):
        part["i"] = index
    return parts


def parse(path):
    source = path.read_text(encoding="utf-8")
    num = path.name[:2]
    sentences = []
    cuts = [m for m in SECTION_RE.finditer(source)]
    bounds = []
    for index, match in enumerate(cuts):
        end = cuts[index + 1].start() if index + 1 < len(cuts) else source.find("</main>")
        bounds.append((match, source[match.end():end]))
    for match, body in bounds:
        chunks = [
            {
                "startF": float(cs_f),
                "endF": float(ce_f),
                "startM": float(cs_m),
                "endM": float(ce_m),
                "parts": parts_of(markup),
                "zh": html.unescape(zh.strip()),
            }
            for cs_f, ce_f, cs_m, ce_m, markup, zh in CHUNK_RE.findall(body)
        ]
        sentences.append(
            {
                "startF": float(match.group(1)),
                "endF": float(match.group(2)),
                "startM": float(match.group(3)),
                "endM": float(match.group(4)),
                "chunks": chunks,
            }
        )
    lesson = {
        "id": num,
        "num": int(num),
        "ipa": html.unescape(IPA_RE.search(source).group(1)),
        "patterns": html.unescape(PATTERNS_RE.search(source).group(1)),
        "titleEn": html.unescape(TITLE_RE.search(source).group(1)),
        "titleZh": html.unescape(ZH_RE.search(source).group(1)),
        "sentences": sentences,
    }
    files = {}
    for voice in VOICES:
        audio = AUDIO_DIR / num / f"story-{voice}.mp3"
        if not audio.exists():
            raise SystemExit(f"missing {voice} audio for lesson {num}")
        files[voice] = audio
    lesson["bytes"] = sum(item.stat().st_size for item in files.values())
    return lesson, files


def js(value):
    """JSON is valid JS for these values; keep separators tight."""
    import json

    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def packages(lessons):
    """Balanced groups of PER_PACKAGE lessons, never over MAX_PACKAGE_BYTES."""
    groups, current, size = [], [], 0
    for lesson in lessons:
        if current and (len(current) >= PER_PACKAGE or size + lesson["bytes"] > MAX_PACKAGE_BYTES):
            groups.append(current)
            current, size = [], 0
        current.append(lesson)
        size += lesson["bytes"]
    if current:
        groups.append(current)
    return groups


APP_JS = """const config = require('./config');

App({
  onLaunch() {
    if (!wx.cloud) return;
    const options = { traceUser: false };
    if (config.cloudEnv) options.env = config.cloudEnv;
    try {
      wx.cloud.init(options);
    } catch (err) {
      // 云开发没开通时忽略：Question Drill 仍可用，只是不显示发音按钮。
    }
  }
});
"""

APP_JSON_HEAD = """{
  "pages": ["pages/index/index", "pages/phonics/phonics", "pages/drill/drill"],
  "window": {
    "navigationBarBackgroundColor": "#ffffff",
    "navigationBarTextStyle": "black",
    "navigationBarTitleText": "NaughtyPiESL",
    "backgroundColor": "#ffffff",
    "backgroundTextStyle": "dark"
  },
  "sitemapLocation": "sitemap.json",
  "lazyCodeLoading": "requiredComponents",
  "subpackages": [
"""

SITEMAP = """{
  "desc": "sitemap",
  "rules": [{ "action": "allow", "page": "*" }]
}
"""

PROJECT = """{
  "appid": "__APPID__",
  "projectname": "NaughtyPiESL",
  "compileType": "miniprogram",
  "description": "NaughtyPiESL：自然拼读阅读训练 + Question Drill",
  "setting": {
    "es6": true,
    "enhance": true,
    "postcss": true,
    "minified": true,
    "urlCheck": false,
    "checkInvalidKey": true
  }
}
"""

PHONICS_JS = """const lessons = require('../../data/lessons.js');

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
"""

PHONICS_JSON = """{
  "navigationBarTitleText": "自然拼读阅读训练"
}
"""

PHONICS_WXML = """<view class="page">
  <text class="h1">自然拼读阅读训练</text>

  <block wx:for="{{groups}}" wx:for-item="group" wx:key="name">
    <text class="section">{{group.name}}</text>
    <view class="list">
      <view
        class="row"
        wx:for="{{group.items}}"
        wx:for-item="item"
        wx:key="id"
        hover-class="row-hover"
        bindtap="open"
        data-id="{{item.id}}"
      >
        <text class="num">{{item.num}}</text>
        <text class="ipa">{{item.ipa}}</text>
        <view class="meta">
          <text class="en">{{item.titleEn}}</text>
          <text class="zh">{{item.titleZh}}</text>
        </view>
        <text class="patterns">{{item.patterns}}</text>
      </view>
    </view>
  </block>
</view>
"""

PHONICS_WXSS = """page {
  background: #ffffff;
  color: #1d1d1f;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.page {
  padding: 56rpx 44rpx 140rpx;
}

.h1 {
  display: block;
  font-size: 68rpx;
  font-weight: 700;
  letter-spacing: -2rpx;
  line-height: 1.1;
}

.sub {
  display: block;
  margin-top: 16rpx;
  color: #6e6e73;
  font-size: 30rpx;
}

.section {
  display: block;
  margin: 64rpx 0 14rpx;
  color: #6e6e73;
  font-size: 26rpx;
  font-weight: 600;
  letter-spacing: 3rpx;
}

.list {
  border-top: 1rpx solid #d2d2d7;
}

.row {
  display: flex;
  align-items: center;
  padding: 28rpx 8rpx;
  border-bottom: 1rpx solid #d2d2d7;
}

.row-hover {
  background: #f5f5f7;
}

.num {
  width: 52rpx;
  flex: none;
  color: #6e6e73;
  font-size: 26rpx;
}

.ipa {
  flex: none;
  min-width: 96rpx;
  padding: 6rpx 18rpx;
  border-radius: 16rpx;
  background: #e8f2ff;
  color: #0071e3;
  font-size: 30rpx;
  font-weight: 600;
  text-align: center;
}

.meta {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}

.en {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
  letter-spacing: -0.5rpx;
}

.zh {
  display: block;
  margin-top: 4rpx;
  color: #6e6e73;
  font-size: 26rpx;
}

.patterns {
  flex: none;
  max-width: 220rpx;
  margin-left: 16rpx;
  color: #6e6e73;
  font-size: 22rpx;
  text-align: right;
}
"""

INDEX_JS = """Page({
  openPhonics() {
    wx.navigateTo({ url: '/pages/phonics/phonics' });
  },

  openDrill() {
    wx.navigateTo({ url: '/pages/drill/drill' });
  }
});
"""

INDEX_JSON = """{
  "navigationBarTitleText": "NaughtyPiESL"
}
"""

INDEX_WXML = """<view class="page">
  <text class="h1">NaughtyPiESL</text>

  <view class="cards">
    <view class="card" hover-class="card-hover" bindtap="openPhonics">
      <view class="glyph">Aa</view>
      <view class="body">
        <text class="title">自然拼读阅读训练</text>
      </view>
      <text class="arrow">›</text>
    </view>

    <view class="card" hover-class="card-hover" bindtap="openDrill">
      <view class="glyph glyph-alt">Q</view>
      <view class="body">
        <text class="title">Question Drill</text>
      </view>
      <text class="arrow">›</text>
    </view>
  </view>
</view>
"""

INDEX_WXSS = """page {
  background: #ffffff;
  color: #1d1d1f;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.page {
  padding: 72rpx 44rpx 80rpx;
}

.h1 {
  display: block;
  font-size: 64rpx;
  font-weight: 700;
  letter-spacing: -2rpx;
  line-height: 1.1;
}

.sub {
  display: block;
  margin-top: 14rpx;
  color: #6e6e73;
  font-size: 28rpx;
}

.cards {
  margin-top: 72rpx;
}

.card {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
  padding: 32rpx;
  border: 1rpx solid #e5e5ea;
  border-radius: 28rpx;
}

.card-hover {
  background: #f5f5f7;
}

.glyph {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96rpx;
  height: 96rpx;
  border-radius: 24rpx;
  background: #e8f2ff;
  color: #0071e3;
  font-size: 36rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
}

.glyph-alt {
  background: #f5f5f7;
  color: #1d1d1f;
}

.body {
  flex: 1;
  min-width: 0;
  margin-left: 28rpx;
}

.title {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
  letter-spacing: -0.5rpx;
}

.desc {
  display: block;
  margin-top: 6rpx;
  color: #6e6e73;
  font-size: 25rpx;
}

.arrow {
  flex: none;
  margin-left: 16rpx;
  color: #c7c7cc;
  font-size: 44rpx;
  line-height: 1;
}
"""

LESSON_JS = """const lessons = require('../../../data/lessons.js');

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
"""

LESSON_JSON = """{
  "navigationBarTitleText": "课程",
  "usingComponents": {
    "player": "/components/player/player"
  }
}
"""

LESSON_WXML = """<player wx:if="{{lesson}}" id="player" lesson="{{lesson}}" />
<view wx:else class="loading">加载中…</view>
"""

LESSON_WXSS = """page {
  background: #ffffff;
  color: #1d1d1f;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.loading {
  padding: 200rpx 0;
  text-align: center;
  color: #6e6e73;
  font-size: 30rpx;
}
"""
PLAYER_JS = """Component({
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
"""

PLAYER_JSON = """{
  "component": true
}
"""

PLAYER_WXML = """<view class="page">
  <view class="lesson">
    <text class="phoneme">{{lesson.ipa}}</text>
    <text class="patterns">{{lesson.patterns}}</text>
  </view>

  <text class="h1">{{lesson.titleEn}}</text>
  <text class="title-zh">{{lesson.titleZh}}</text>

  <view class="toolbar">
    <view class="seg">
      <view
        class="seg-btn {{voice === 'f' ? 'is-on' : ''}}"
        catchtap="setVoice"
        data-voice="f"
      >女声</view>
      <view
        class="seg-btn {{voice === 'm' ? 'is-on' : ''}}"
        catchtap="setVoice"
        data-voice="m"
      >男声</view>
    </view>
    <view class="play-all {{mode === 'all' ? 'is-on' : ''}}" bindtap="toggleAll">
      <text>{{mode === 'all' ? '停止' : '全文连读'}}</text>
    </view>
  </view>

  <view class="rule"></view>

  <view class="passage">
    <view
      class="sentence"
      wx:for="{{lesson.sentences}}"
      wx:for-item="sentence"
      wx:for-index="si"
      wx:key="startF"
    >
      <view
        class="speaker {{activeSentence === si ? 'is-active' : ''}}"
        catchtap="playSentence"
        data-si="{{si}}"
      >
        <text class="speaker-ico">▶</text>
      </view>

      <view class="rows">
        <view
          class="row"
          wx:for="{{sentence.chunks}}"
          wx:for-item="chunk"
          wx:for-index="ci"
          wx:key="startF"
        >
          <view
            class="chunk {{activeChunk === si + '-' + ci ? 'is-playing' : ''}}"
            catchtap="playChunk"
            data-si="{{si}}"
            data-ci="{{ci}}"
          >
            <text
              wx:for="{{chunk.parts}}"
              wx:for-item="part"
              wx:key="i"
              class="{{part.s ? 'sound' : ''}}"
            >{{part.t}}</text>
          </view>
          <text class="zh">{{chunk.zh}}</text>
        </view>
      </view>
    </view>
  </view>

  <text wx:if="{{failed}}" class="status">这段音频没能播放，请返回再试。</text>
</view>
"""

PLAYER_WXSS = """.page {
  padding: 40rpx 44rpx 140rpx;
  color: #1d1d1f;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.lesson {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.phoneme {
  padding: 0 20rpx;
  height: 60rpx;
  line-height: 60rpx;
  border-radius: 16rpx;
  background: #e8f2ff;
  color: #0071e3;
  font-size: 32rpx;
  font-weight: 600;
}

.patterns {
  margin-left: 20rpx;
  color: #6e6e73;
  font-size: 28rpx;
  letter-spacing: 1rpx;
}

.h1 {
  display: block;
  margin-top: 32rpx;
  font-size: 64rpx;
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: -2rpx;
}

.title-zh {
  display: block;
  margin-top: 12rpx;
  color: #6e6e73;
  font-size: 36rpx;
  letter-spacing: 4rpx;
}

.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 40rpx;
}

.seg {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 6rpx;
  border-radius: 999rpx;
  background: #f5f5f7;
}

.seg-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 76rpx;
  padding: 0 36rpx;
  border-radius: 999rpx;
  color: #6e6e73;
  font-size: 28rpx;
}

.seg-btn.is-on {
  background: #ffffff;
  color: #1d1d1f;
  box-shadow: 0 1rpx 4rpx rgba(0, 0, 0, 0.08);
}

.play-all {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  margin-top: 0;
  margin-left: 16rpx;
  padding: 0 44rpx;
  border-radius: 999rpx;
  background: #0071e3;
  color: #ffffff;
  font-size: 30rpx;
}

.play-all.is-on {
  background: #515154;
}

.rule {
  height: 1rpx;
  margin-top: 48rpx;
  background: #e5e5ea;
}

.passage {
  margin-top: 48rpx;
}

.sentence {
  display: flex;
  align-items: flex-start;
  margin-bottom: 48rpx;
}

.speaker {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  margin-top: 8rpx;
  border-radius: 50%;
  color: #515154;
}

.speaker.is-active {
  background: #e8f2ff;
  color: #0071e3;
}

.speaker-ico {
  font-size: 22rpx;
}

.rows {
  flex: 1;
  min-width: 0;
  margin-left: 16rpx;
}

.row {
  margin-bottom: 14rpx;
}

.chunk {
  font-size: 40rpx;
  line-height: 1.5;
}

.chunk.is-playing {
  color: #0071e3;
}

.sound {
  color: #0071e3;
  font-weight: 600;
}

.zh {
  display: block;
  margin-top: 2rpx;
  color: #6e6e73;
  font-size: 28rpx;
}

.status {
  display: block;
  margin-top: 40rpx;
  color: #6e6e73;
  font-size: 28rpx;
}
"""


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def main():
    lessons, audio = [], {}
    for path in sorted(LESSONS_DIR.glob("*.html")):
        lesson, mp3 = parse(path)
        lessons.append(lesson)
        audio[lesson["id"]] = mp3
    lessons.sort(key=lambda item: item["num"])
    if len(lessons) != 48:
        raise SystemExit(f"expected 48 lessons, found {len(lessons)}")

    # Stale packages from an earlier run would otherwise stay in the app and
    # blow past the 20 MB total limit.
    for stale in OUT.glob("pkg*"):
        if stale.is_dir():
            shutil.rmtree(stale)

    groups = packages(lessons)
    for index, group in enumerate(groups, start=1):
        root = f"pkg{index}"
        for lesson in group:
            lesson["pkg"] = root
            for voice in VOICES:
                lesson[f"audio{voice.upper()}"] = (
                    f"/{root}/audio/{lesson['id']}-{voice}.mp3"
                )
                target = OUT / root / "audio" / f"{lesson['id']}-{voice}.mp3"
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(audio[lesson["id"]][voice], target)

    for lesson in lessons:
        lesson.pop("bytes", None)

    write(OUT / "app.js", APP_JS)
    write(OUT / "app.wxss", "")
    write(OUT / "sitemap.json", SITEMAP)
    write(OUT / "project.config.json", PROJECT.replace("__APPID__", APPID))

    entries = [
        "    { \"root\": \"%s\", \"pages\": [\"pages/lesson/lesson\"] }" % f"pkg{i}"
        for i in range(1, len(groups) + 1)
    ]
    write(OUT / "app.json", APP_JSON_HEAD + ",\n".join(entries) + "\n  ]\n}\n")

    payload = "module.exports = " + js(lessons) + ";\n"
    write(OUT / "data" / "lessons.js", payload)

    write(OUT / "pages/index/index.js", INDEX_JS)
    write(OUT / "pages/index/index.json", INDEX_JSON)
    write(OUT / "pages/index/index.wxml", INDEX_WXML)
    write(OUT / "pages/index/index.wxss", INDEX_WXSS)

    write(OUT / "pages/phonics/phonics.js", PHONICS_JS)
    write(OUT / "pages/phonics/phonics.json", PHONICS_JSON)
    write(OUT / "pages/phonics/phonics.wxml", PHONICS_WXML)
    write(OUT / "pages/phonics/phonics.wxss", PHONICS_WXSS)

    write(OUT / "components/player/player.js", PLAYER_JS)
    write(OUT / "components/player/player.json", PLAYER_JSON)
    write(OUT / "components/player/player.wxml", PLAYER_WXML)
    write(OUT / "components/player/player.wxss", PLAYER_WXSS)

    for i in range(1, len(groups) + 1):
        folder = OUT / f"pkg{i}" / "pages" / "lesson"
        write(folder / "lesson.js", LESSON_JS)
        write(folder / "lesson.json", LESSON_JSON)
        write(folder / "lesson.wxml", LESSON_WXML)
        write(folder / "lesson.wxss", LESSON_WXSS)

    total_audio = sum(p.stat().st_size for p in OUT.glob("pkg*/audio/*.mp3"))
    print(f"built {OUT}")
    print(f"  packages: {len(groups)} -> " + ", ".join(
        f"pkg{i}:{len(g)}" for i, g in enumerate(groups, start=1)
    ))
    print(f"  audio: {total_audio / 1e6:.2f} MB")
    print(f"  data: {(OUT / 'data' / 'lessons.js').stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
