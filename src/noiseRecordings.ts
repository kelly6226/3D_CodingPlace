// 녹음으로 트는 배경 소리. 파일은 public/sounds/<id>.mp3 (끊김 없는 루프, 출처는 public/sounds/SOURCES.md)
// 그 소리를 처음 고를 때만 받아요. 첫 화면 로딩에는 안 들어가요.
import type { NoiseId } from './config';

export type RecordingId = Extract<NoiseId, 'fire' | 'fireplace' | 'rain' | 'ocean' | 'stream' | 'forest' | 'night' | 'cafe' | 'library' | 'typing' | 'clock'>;

/**
 * 소리마다 크기. 파일 전체 RMS를 재서, 마스터(0.7)를 거친 뒤 장소 소리(카페, RMS 약 0.017)와 비슷하게 들리도록 맞췄어요.
 * 계산: 목표 RMS / (0.7 × 파일 RMS). 목표는 대부분 0.014~0.016이고, 시계·타자·풀벌레·도서관처럼
 * 귀에 잘 걸리는 소리는 0.008~0.012로 낮췄어요. 모든 소리가 피크 1.0을 넘지 않아요.
 */
const GAIN: Record<RecordingId, number> = {
  fire: 0.42,
  fireplace: 0.28,
  rain: 0.41,
  ocean: 0.33,
  stream: 0.36,
  forest: 0.23,
  night: 0.3,
  cafe: 0.35,
  library: 0.26,
  typing: 0.27,
  clock: 0.16,
};

/** 소리를 바꿀 때 서서히 줄이고 키우는 시간(초) */
const FADE_SEC = 0.6;
/**
 * 파일 앞뒤에 디코더가 붙이는 무음(mp3 패딩)을 잘라낼 최대 길이.
 * 크롬은 알아서 잘라 주지만 다른 브라우저는 남길 수 있어서, 남아 있으면 반복할 때마다 '툭' 끊겨요
 */
const MAX_PADDING_SAMPLES = 4096;
const SILENCE = 1e-4;

export const isRecording = (id: NoiseId): id is RecordingId => id in GAIN;

const buffers = new Map<RecordingId, Promise<AudioBuffer>>();

function loadBuffer(ctx: AudioContext, id: RecordingId): Promise<AudioBuffer> {
  let p = buffers.get(id);
  if (!p) {
    p = fetch(`/sounds/${id}.mp3`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    // 실패하면 다음에 다시 받아 볼 수 있게 지워요
    p.catch(() => buffers.delete(id));
    buffers.set(id, p);
  }
  return p;
}

/** 앞뒤 무음 길이(샘플). 반복 구간을 여기서부터 여기까지로 잡아요 */
function paddingOf(buf: AudioBuffer) {
  const d = buf.getChannelData(0);
  let head = 0;
  while (head < MAX_PADDING_SAMPLES && Math.abs(d[head]) < SILENCE) head++;
  let tail = 0;
  while (tail < MAX_PADDING_SAMPLES && Math.abs(d[d.length - 1 - tail]) < SILENCE) tail++;
  return { head, tail };
}

/** 녹음 하나를 반복해서 틀고, 끄는 함수를 돌려줘요. 받는 중에 끄면 받은 뒤에도 안 틀어요 */
export function playRecording(ctx: AudioContext, to: AudioNode, id: RecordingId): () => void {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(to);
  let src: AudioBufferSourceNode | null = null;
  let stopped = false;

  loadBuffer(ctx, id)
    .then((buf) => {
      if (stopped) return;
      const { head, tail } = paddingOf(buf);
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = head / buf.sampleRate;
      src.loopEnd = (buf.length - tail) / buf.sampleRate;
      src.connect(out);
      src.start(0, src.loopStart);
      out.gain.setTargetAtTime(GAIN[id], ctx.currentTime, FADE_SEC / 3);
    })
    .catch((e) => console.warn(`[sound] ${id} 소리를 불러오지 못했어요`, e));

  return () => {
    stopped = true;
    const t = ctx.currentTime;
    out.gain.setTargetAtTime(0, t, FADE_SEC / 3);
    if (!src) {
      out.disconnect();
      return;
    }
    src.onended = () => out.disconnect();
    src.stop(t + FADE_SEC * 2);
  };
}
