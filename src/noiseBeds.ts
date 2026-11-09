// 코드로 합성하는 배경 소리(소음 세 가지). 맥 '배경 사운드'의 균형·밝은·어두운 소음을 참고했어요.
// 자연·공간 소리는 녹음(noiseRecordings.ts)을 써요. 장소 소리('place')와 '없음'('off')은 audio.ts가 맡아요.
import type { NoiseId } from './config';

export type BedId = Extract<NoiseId, 'balanced' | 'bright' | 'dark'>;

/**
 * 소리마다 크기. 헤드리스 크롬에서 RMS를 재서 장소 소리(카페, RMS 약 0.017)와 비슷한 크기로 대략 맞췄어요.
 * 낮은 소리는 같은 RMS여도 작게 들려서 어두운 소음은 조금 크게, 밝은 소음은 조금 작게 뒀어요.
 */
const LEVEL: Record<BedId, number> = {
  balanced: 0.16,
  bright: 0.056,
  dark: 0.28,
};

export const isBed = (id: NoiseId): id is BedId => id in LEVEL;

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

  const src = ctx.createBufferSource();
  src.loop = true;
  const filters: BiquadFilterNode[] = [];
  const filter = (type: BiquadFilterType, freq: number) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    filters.push(f);
  };
  if (id === 'balanced') {
    // 고르게 퍼진 쉬- 소리
    src.buffer = buf.pink;
    filter('lowpass', 9000);
  } else if (id === 'bright') {
    // 높은 소리가 살아 있는 소음. 너무 날카롭지 않게 맨 위만 깎아요
    src.buffer = buf.white;
    filter('highpass', 250);
    filter('lowpass', 11000);
  } else {
    // 낮게 웅- 하는 소음
    src.buffer = buf.brown;
    filter('lowpass', 650);
  }
  filters.reduce<AudioNode>((prev, f) => prev.connect(f), src).connect(out);
  src.start(0, Math.random() * BUFFER_SEC);

  return () => {
    const t = ctx.currentTime;
    out.gain.setTargetAtTime(0, t, FADE_SEC / 3);
    src.onended = () => out.disconnect();
    src.stop(t + FADE_SEC * 2);
  };
}
