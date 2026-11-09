// 고를 수 있는 배경 소리(백색소음)를 Web Audio로 합성해요.
// 맥 '배경 사운드'의 macOS Sequoia 목록(균형·밝은·어두운 소음, 바다, 비, 시냇물, 밤, 불)을 참고했고,
// 애플 녹음 파일은 쓰지 않아요. 장소 소리('place')와 '없음'('off')은 audio.ts가 맡아요.
import type { NoiseId } from './config';

export type BedId = Exclude<NoiseId, 'place' | 'off'>;

/**
 * 소리마다 크기. 헤드리스 크롬에서 RMS를 재서 장소 소리(카페, RMS 약 0.017)와 비슷한 크기로 대략 맞췄어요.
 * 낮은 소리는 같은 RMS여도 작게 들려서 어두운 소음은 조금 크게, 밝은 소음은 조금 작게 뒀어요.
 */
const LEVEL: Record<BedId, number> = {
  balanced: 0.16,
  bright: 0.056,
  dark: 0.28,
  ocean: 0.26,
  rain: 0.13,
  stream: 0.28,
  night: 0.35,
  fire: 0.22,
};

/** 소리를 바꿀 때 서서히 줄이고 키우는 시간(초) */
const FADE_SEC = 0.6;

export interface NoiseBuffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

/** 루프 버퍼 길이(초). 짧으면 반복이 귀에 들려요 */
const BUFFER_SEC = 6;

/** 끝과 처음 값이 이어지게 기울기를 빼요. 안 그러면 루프가 돌 때마다 '톡' 소리가 나요 */
function joinLoopEnds(d: Float32Array) {
  const n = d.length;
  const drift = d[n - 1] - d[0];
  for (let i = 0; i < n; i++) d[i] -= (drift * i) / (n - 1);
}

function normalize(d: Float32Array, peak = 0.9) {
  let max = 0;
  for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
  if (max > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / max;
}

export function makeNoiseBuffers(ctx: BaseAudioContext): NoiseBuffers {
  const len = Math.floor(ctx.sampleRate * BUFFER_SEC);
  const white = ctx.createBuffer(1, len, ctx.sampleRate);
  const pink = ctx.createBuffer(1, len, ctx.sampleRate);
  const brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  const b = brown.getChannelData(0);
  // 핑크: Paul Kellet 필터, 브라운: 새는 적분기
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let last = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last;
  }
  for (const d of [p, b]) {
    joinLoopEnds(d);
    normalize(d);
  }
  normalize(w);
  return { white, pink, brown };
}

/** 배경 소리 하나를 틀고, 끄는 함수를 돌려줘요 */
export function playBed(ctx: AudioContext, to: AudioNode, id: BedId, buf: NoiseBuffers): () => void {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(LEVEL[id], ctx.currentTime, FADE_SEC / 3);
  out.connect(to);

  const sources: AudioScheduledSourceNode[] = [];
  const timers = new Set<number>();
  let alive = true;

  const loop = (buffer: AudioBuffer) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // 같은 버퍼를 여러 겹 쓸 때 같은 자리에서 시작하면 소리가 겹쳐 커져서 시작점을 흩뜨려요
    src.start(0, Math.random() * BUFFER_SEC);
    sources.push(src);
    return src;
  };
  const filter = (type: BiquadFilterType, freq: number, q = 0.7) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  };
  const gain = (v: number) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  /** 끌 때까지 ms 뒤마다 다시 부르는 반복. fn은 다음 간격(ms)을 돌려줘요 */
  const every = (fn: () => number) => {
    const tick = () => {
      if (!alive) return;
      const id = window.setTimeout(() => {
        timers.delete(id);
        tick();
      }, fn());
      timers.add(id);
    };
    tick();
  };
  /** 짧게 '톡' 하는 소리 (빗방울, 장작 튀는 소리) */
  const tap = (freq: number, dur: number, vol: number, type: BiquadFilterType = 'bandpass') => {
    const src = ctx.createBufferSource();
    src.buffer = buf.white;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter(type, freq, 1.2)).connect(g).connect(out);
    src.start(t, Math.random() * BUFFER_SEC, dur + 0.02);
  };
  const rand = (min: number, max: number) => min + Math.random() * (max - min);

  switch (id) {
    case 'balanced':
      // 고르게 퍼진 쉬- 소리
      loop(buf.pink).connect(filter('lowpass', 9000)).connect(out);
      break;

    case 'bright':
      // 높은 소리가 살아 있는 소음. 너무 날카롭지 않게 맨 위만 깎아요
      loop(buf.white).connect(filter('highpass', 250)).connect(filter('lowpass', 11000)).connect(out);
      break;

    case 'dark':
      // 낮게 웅- 하는 소음
      loop(buf.brown).connect(filter('lowpass', 650)).connect(out);
      break;

    case 'ocean': {
      // 파도가 밀려왔다 빠지는 소리: 밝기와 크기가 함께 6~11초마다 오르내려요
      const swellF = filter('lowpass', 400);
      const swell = gain(0.15);
      loop(buf.pink).connect(swellF).connect(swell).connect(out);
      const foam = gain(0);
      loop(buf.white).connect(filter('bandpass', 2600, 0.6)).connect(foam).connect(out);
      loop(buf.brown).connect(filter('lowpass', 300)).connect(gain(0.35)).connect(out);
      every(() => {
        const period = rand(6, 11);
        const rise = period * 0.4;
        const peak = rand(0.6, 1);
        const t = ctx.currentTime;
        swell.gain.setTargetAtTime(peak, t, rise / 3);
        swellF.frequency.setTargetAtTime(rand(1400, 2200), t, rise / 3);
        foam.gain.setTargetAtTime(peak * 0.25, t + rise * 0.7, rise / 4);
        swell.gain.setTargetAtTime(0.15, t + rise, (period - rise) / 3);
        swellF.frequency.setTargetAtTime(380, t + rise, (period - rise) / 3);
        foam.gain.setTargetAtTime(0, t + rise, (period - rise) / 4);
        return period * 1000;
      });
      break;
    }

    case 'rain': {
      // 쏴- 하는 빗줄기 + 낮게 깔리는 빗소리 + 가끔 굵은 빗방울
      loop(buf.white).connect(filter('bandpass', 1400, 0.4)).connect(filter('lowpass', 5000)).connect(out);
      loop(buf.pink).connect(filter('lowpass', 900)).connect(gain(0.5)).connect(out);
      every(() => {
        tap(rand(2500, 6000), 0.02, rand(0.02, 0.12));
        return rand(30, 220);
      });
      break;
    }

    case 'stream': {
      // 졸졸 흐르는 물: 좁은 대역 두 개가 빠르게 높낮이를 바꿔요
      loop(buf.pink).connect(filter('lowpass', 1200)).connect(gain(0.35)).connect(out);
      for (let k = 0; k < 2; k++) {
        const band = filter('bandpass', 1200, 3);
        const g = gain(0.5);
        loop(buf.white).connect(band).connect(g).connect(out);
        every(() => {
          const t = ctx.currentTime;
          band.frequency.setTargetAtTime(rand(500, 2600), t, 0.03);
          g.gain.setTargetAtTime(rand(0.3, 1.1), t, 0.04);
          return rand(60, 180);
        });
      }
      break;
    }

    case 'night': {
      // 멀리 부는 바람 + 귀뚜라미 두 마리
      loop(buf.brown).connect(filter('lowpass', 420)).connect(gain(0.5)).connect(out);
      for (const pitch of [4300, 4750]) {
        const osc = ctx.createOscillator();
        osc.frequency.value = pitch;
        const env = gain(0);
        osc.connect(env).connect(gain(0.05)).connect(out);
        osc.start();
        sources.push(osc);
        every(() => {
          // 귀뚜라미 한 번 울음 = 짧은 소리 3~4번
          const t = ctx.currentTime + 0.02;
          const pulses = Math.random() < 0.5 ? 3 : 4;
          for (let i = 0; i < pulses; i++) {
            const at = t + i * 0.05;
            env.gain.setValueAtTime(0, at);
            env.gain.linearRampToValueAtTime(1, at + 0.008);
            env.gain.linearRampToValueAtTime(0, at + 0.03);
          }
          // 가끔 쉬어요
          return Math.random() < 0.15 ? rand(2000, 4000) : rand(450, 900);
        });
      }
      break;
    }

    case 'fire': {
      // 낮게 타는 소리가 일렁이고, 장작이 탁탁 튀어요
      const flicker = gain(0.8);
      loop(buf.brown).connect(filter('lowpass', 500)).connect(flicker).connect(out);
      every(() => {
        flicker.gain.setTargetAtTime(rand(0.55, 1), ctx.currentTime, 0.12);
        return rand(150, 400);
      });
      every(() => {
        if (Math.random() < 0.12) tap(rand(250, 600), 0.04, rand(0.15, 0.35), 'lowpass');
        else tap(rand(2000, 6000), rand(0.004, 0.015), rand(0.03, 0.18));
        return Math.random() < 0.2 ? rand(5, 40) : rand(60, 450);
      });
      break;
    }
  }

  return () => {
    alive = false;
    for (const t of timers) window.clearTimeout(t);
    timers.clear();
    const t = ctx.currentTime;
    out.gain.setTargetAtTime(0, t, FADE_SEC / 3);
    // 소리가 다 줄어든 뒤 멈추고, 멈추면 연결도 끊어요
    sources[0].onended = () => out.disconnect();
    for (const s of sources) s.stop(t + FADE_SEC * 2);
  };
}
