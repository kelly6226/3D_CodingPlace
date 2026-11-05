// 소리는 전부 Web Audio로 합성 (빗소리, 카페 웅성임, 타자 소리, 사이렌, 꽥)

class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambience: GainNode | null = null;
  private noise!: AudioBuffer;
  enabled = true;

  /** 사용자가 버튼을 누른 뒤에만 호출 (브라우저 자동재생 정책) */
  start() {
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

    // 창밖 빗소리
    const rain = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5000;
    const rg = ctx.createGain();
    rg.gain.value = 0.09;
    rain.connect(bp).connect(lp).connect(rg).connect(this.ambience);
    rain.start();

    // 카페 웅성임 (낮은 소리)
    const hum = this.noiseSrc();
    const hl = ctx.createBiquadFilter();
    hl.type = 'lowpass';
    hl.frequency.value = 320;
    const hg = ctx.createGain();
    hg.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.04;
    lfo.connect(lfoG).connect(hg.gain);
    lfo.start();
    hum.connect(hl).connect(hg).connect(this.ambience);
    hum.start(0, 0.7);

    // 가끔 떨어지는 굵은 빗방울
    const drip = () => {
      if (!this.ctx) return;
      this.burst(3000 + Math.random() * 3000, 0.02, 0.025 * Math.random());
      window.setTimeout(drip, 200 + Math.random() * 900);
    };
    drip();
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
