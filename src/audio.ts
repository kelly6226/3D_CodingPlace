// 소리는 전부 Web Audio로 합성 (빗소리, 웅성임, 팬 소리, 타자 소리, 사이렌, 꽥, 야옹)

export type Ambience = 'cafe' | 'server' | 'studio' | 'hackathon';

/** 장소별 배경 소리 비율: 비, 웅성임, 팬, 빗방울 */
const MIX: Record<Ambience, { rain: number; hum: number; fan: number; drip: number }> = {
  cafe: { rain: 0.09, hum: 0.12, fan: 0, drip: 1 },
  server: { rain: 0, hum: 0.03, fan: 0.2, drip: 0 },
  studio: { rain: 0.035, hum: 0.02, fan: 0.035, drip: 0.6 },
  hackathon: { rain: 0, hum: 0.22, fan: 0.04, drip: 0 },
};

type NavigatorWithAudioSession = Navigator & { audioSession?: { type: string } };

/**
 * iOS 사파리는 오디오 세션 기본값이 ambient라서, 무음 스위치가 켜져 있으면 Web Audio가 안 들린다.
 * 'playback'으로 바꾸면 무음 스위치와 상관없이 난다 (iOS 16.4+, 없으면 아무것도 안 함).
 * 부작용: 다른 앱에서 재생 중인 음악이 멈출 수 있다.
 */
function playEvenWhenSilentSwitchOn() {
  const nav = navigator as NavigatorWithAudioSession;
  if (nav.audioSession) nav.audioSession.type = 'playback';
}

class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambience: GainNode | null = null;
  private mix: { rain: GainNode; hum: GainNode; fan: GainNode } | null = null;
  private amb: Ambience = 'cafe';
  private noise!: AudioBuffer;
  enabled = true;

  /** 사용자가 버튼을 누른 뒤에만 호출 (브라우저 자동재생 정책) */
  start() {
    playEvenWhenSilentSwitchOn();
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.7 : 0;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startAmbience();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.2);
  }

  private noiseSrc() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  private startAmbience() {
    const ctx = this.ctx!;
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0;
    this.ambience.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
    this.ambience.connect(this.master);
    const mixGain = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.ambience!);
      return g;
    };
    this.mix = { rain: mixGain(), hum: mixGain(), fan: mixGain() };

    // 창밖 빗소리
    const rain = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5000;
    rain.connect(bp).connect(lp).connect(this.mix.rain);
    rain.start();

    // 사람들 웅성임 (낮은 소리, 천천히 커졌다 작아졌다)
    const hum = this.noiseSrc();
    const hl = ctx.createBiquadFilter();
    hl.type = 'lowpass';
    hl.frequency.value = 320;
    const hg = ctx.createGain();
    hg.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.33;
    lfo.connect(lfoG).connect(hg.gain);
    lfo.start();
    hum.connect(hl).connect(hg).connect(this.mix.hum);
    hum.start(0, 0.7);

    // 팬 소리 (서버 랙, 컴퓨터, 에어컨)
    const fan = this.noiseSrc();
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 420;
    const fb = ctx.createBiquadFilter();
    fb.type = 'bandpass';
    fb.frequency.value = 1900;
    fb.Q.value = 0.9;
    const fbg = ctx.createGain();
    fbg.gain.value = 0.25;
    fan.connect(fl).connect(this.mix.fan);
    fan.connect(fb).connect(fbg).connect(this.mix.fan);
    fan.start(0, 1.3);
    const whine = ctx.createOscillator();
    whine.frequency.value = 120;
    const wg = ctx.createGain();
    wg.gain.value = 0.04;
    whine.connect(wg).connect(this.mix.fan);
    whine.start();

    this.applyMix(0.01);

    // 가끔 떨어지는 굵은 빗방울
    const drip = () => {
      if (!this.ctx) return;
      const m = MIX[this.amb];
      if (m.drip > 0) this.burst(3000 + Math.random() * 3000, 0.02, 0.025 * Math.random() * m.drip);
      window.setTimeout(drip, 200 + Math.random() * 900);
    };
    drip();
  }

  /** 장소마다 배경 소리 섞는 비율 */
  setAmbience(kind: Ambience) {
    this.amb = kind;
    this.applyMix(0.8);
  }

  private applyMix(tc: number) {
    if (!this.ctx || !this.mix) return;
    const m = MIX[this.amb];
    const t = this.ctx.currentTime;
    this.mix.rain.gain.setTargetAtTime(m.rain, t, tc);
    this.mix.hum.gain.setTargetAtTime(m.hum, t, tc);
    this.mix.fan.gain.setTargetAtTime(m.fan, t, tc);
  }

  private burst(freq: number, dur: number, vol: number, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.02);
  }

  /** 키보드 소리 (기계식 갈축 느낌) */
  key(vol = 0.18) {
    this.burst(2200 + Math.random() * 1600, 0.035, vol);
    this.burst(600 + Math.random() * 200, 0.02, vol * 0.5, 'lowpass');
  }

  /** 다른 사람들이 멀리서 치는 타자 */
  distantKeys(n: number) {
    for (let i = 0; i < n; i++) window.setTimeout(() => this.key(0.035), i * (60 + Math.random() * 90));
  }

  coffee() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    // 그라인더
    const src = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 2;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.1);
    g.gain.setValueAtTime(0.15, t + 1.2);
    g.gain.linearRampToValueAtTime(0, t + 1.4);
    // 스팀
    const f2 = ctx.createBiquadFilter();
    f2.type = 'highpass';
    f2.frequency.value = 4000;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t + 1.5);
    g2.gain.linearRampToValueAtTime(0.06, t + 1.7);
    g2.gain.linearRampToValueAtTime(0, t + 2.8);
    src.connect(f).connect(g).connect(this.master);
    src.connect(f2).connect(g2).connect(this.master);
    src.start(t);
    src.stop(t + 3);
  }

  siren(seconds: number) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.1);
    g.gain.setValueAtTime(0.07, t + seconds - 0.3);
    g.gain.linearRampToValueAtTime(0, t + seconds);
    for (let k = 0; k < seconds / 0.8; k++) {
      o.frequency.setValueAtTime(620, t + k * 0.8);
      o.frequency.linearRampToValueAtTime(940, t + k * 0.8 + 0.4);
      o.frequency.linearRampToValueAtTime(620, t + k * 0.8 + 0.8);
    }
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + seconds + 0.1);
  }

  quack() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime;
    for (const [dt, dur] of [
      [0, 0.16],
      [0.2, 0.2],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(720, t + dt);
      o.frequency.exponentialRampToValueAtTime(380, t + dt + dur);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + dt);
      g.gain.linearRampToValueAtTime(0.25, t + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + dur);
      o.connect(f).connect(g).connect(this.master);
      o.start(t + dt);
      o.stop(t + dt + dur + 0.05);
    }
  }

  meow() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(460, t);
    o.frequency.linearRampToValueAtTime(820, t + 0.18);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.6);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1700, t + 0.2);
    f.frequency.linearRampToValueAtTime(950, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.05);
    g.gain.linearRampToValueAtTime(0.13, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.7);
  }

  /** 먹고 마시기 소리: 커피 머신, 자판기, 물 붓기, 피자 박스 */
  use(kind: Ambience) {
    if (kind === 'cafe') return this.coffee();
    if (kind === 'server') {
      this.burst(160, 0.18, 0.35, 'lowpass');
      window.setTimeout(() => this.burst(2400, 0.05, 0.12), 900);
      window.setTimeout(() => this.burst(140, 0.25, 0.4, 'lowpass'), 1100);
      return;
    }
    if (kind === 'studio') {
      const ctx = this.ctx;
      if (!ctx || !this.enabled) return;
      const src = this.noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.5;
      const t = ctx.currentTime;
      f.frequency.setValueAtTime(2600, t);
      f.frequency.linearRampToValueAtTime(900, t + 1.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.1);
      g.gain.setValueAtTime(0.09, t + 1.4);
      g.gain.linearRampToValueAtTime(0, t + 1.7);
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
      src.stop(t + 1.8);
      return;
    }
    this.burst(500, 0.08, 0.25, 'lowpass');
    window.setTimeout(() => this.burst(700, 0.06, 0.18, 'lowpass'), 160);
  }

  chime() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime;
    [880, 1318.5, 1760].forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 1.6);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 1.7);
    });
  }

  pop() {
    this.burst(1200, 0.06, 0.12);
  }
}

export const sound = new Sound();
