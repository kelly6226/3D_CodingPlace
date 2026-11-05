// 캔버스로 그리는 텍스처들. 외부 이미지 없이 전부 코드로 만들어요.
import * as THREE from 'three';
import type { Commit } from '../net/types';
import { langById } from '../config';

export const FONT_HAND = '"Gaegu", "Nanum Pen Script", "Comic Sans MS", cursive';
export const FONT_MONO = '"JetBrains Mono", "D2Coding", Pretendard, ui-monospace, monospace';
export const FONT_UI = 'Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

export function woodFloor() {
  const { c, ctx } = canvas(1024, 1024);
  const plankH = 64;
  for (let y = 0; y < 1024; y += plankH) {
    let x = -Math.floor(rnd() * 300);
    while (x < 1024) {
      const len = 260 + rnd() * 260;
      const l = 30 + rnd() * 10;
      ctx.fillStyle = `hsl(${24 + rnd() * 6}, ${32 + rnd() * 10}%, ${l}%)`;
      ctx.fillRect(x, y, len, plankH);
      // 나뭇결
      ctx.strokeStyle = 'rgba(40,22,10,0.18)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const yy = y + 8 + rnd() * (plankH - 16);
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.bezierCurveTo(x + len * 0.3, yy + rnd() * 6 - 3, x + len * 0.6, yy + rnd() * 6 - 3, x + len, yy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(15,8,4,0.55)';
      ctx.fillRect(x, y, 2, plankH);
      x += len;
    }
    ctx.fillStyle = 'rgba(15,8,4,0.6)';
    ctx.fillRect(0, y, 1024, 2);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.5, 2.5);
  return t;
}

export function plaster(base: string) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.04})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1.5);
  return t;
}

export function rug() {
  const { c, ctx } = canvas(512, 256);
  ctx.fillStyle = '#2c3a4f';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#c9a25e';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, 484, 228);
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, 456, 200);
  // 브래킷 무늬: 개발자 카페니까
  ctx.fillStyle = 'rgba(201,162,94,0.22)';
  ctx.font = `bold 44px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) ctx.fillText(i % 2 ? '</>' : '{ }', 64 + i * 77, 128);
  return tex(c);
}

/** 노트북 화면: 길게 그려두고 위로 스크롤 */
export function codeScreen() {
  const W = 256;
  const H = 1024;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = '#1b1d2a';
  ctx.fillRect(0, 0, W, H);
  const palette = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff', '#ffcb6b', '#a6accd', '#a6accd', '#a6accd'];
  let indent = 0;
  for (let y = 6; y < H - 6; y += 11) {
    if (rnd() < 0.08) {
      indent = Math.max(0, indent - 1);
      continue;
    }
    let x = 10 + indent * 14;
    const tokens = 1 + Math.floor(rnd() * 5);
    for (let k = 0; k < tokens && x < W - 20; k++) {
      const w = 10 + rnd() * 42;
      ctx.fillStyle = palette[Math.floor(rnd() * palette.length)];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y, w, 5);
      x += w + 6;
    }
    ctx.globalAlpha = 1;
    if (rnd() < 0.18) indent = Math.min(5, indent + 1);
  }
  // 왼쪽 줄 번호 칸
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, 0, 6, H);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 0.16);
  return t;
}

export function whiteboardFront() {
  const { c, ctx } = canvas(1024, 640);
  ctx.fillStyle = '#f7f7f2';
  ctx.fillRect(0, 0, 1024, 640);
  // 지워진 흔적
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(120,130,150,${0.03 + rnd() * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * 1024, rnd() * 640, 60 + rnd() * 120, 20 + rnd() * 40, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1f2a44';
  ctx.font = `bold 70px ${FONT_HAND}`;
  ctx.fillText('It works on my machine', 48, 36);
  ctx.font = `bold 58px ${FONT_HAND}`;
  ctx.fillText('¯\\_(ツ)_/¯', 600, 118);

  // 금요일 배포 금지
  ctx.strokeStyle = '#d62f2f';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(110, 300, 52, 0, Math.PI * 2);
  ctx.moveTo(73, 263);
  ctx.lineTo(147, 337);
  ctx.stroke();
  ctx.fillStyle = '#d62f2f';
  ctx.font = `bold 66px ${FONT_HAND}`;
  ctx.fillText('금요일 배포 금지', 186, 262);

  // 아키텍처 낙서
  ctx.strokeStyle = '#1f5fbf';
  ctx.fillStyle = '#1f5fbf';
  ctx.lineWidth = 5;
  ctx.font = `bold 40px ${FONT_HAND}`;
  const boxes: [number, string][] = [
    [60, '앱'],
    [330, 'API'],
    [600, 'DB'],
  ];
  for (const [x, label] of boxes) {
    ctx.strokeRect(x, 430, 170, 90);
    ctx.fillText(label, x + 50, 450);
  }
  ctx.beginPath();
  ctx.moveTo(232, 475);
  ctx.lineTo(326, 475);
  ctx.moveTo(502, 475);
  ctx.lineTo(596, 475);
  ctx.stroke();
  ctx.strokeStyle = '#d62f2f';
  ctx.fillStyle = '#d62f2f';
  ctx.beginPath();
  ctx.moveTo(840, 400);
  ctx.quadraticCurveTo(800, 430, 760, 455);
  ctx.stroke();
  ctx.font = `bold 44px ${FONT_HAND}`;
  ctx.fillText('여기서 터짐', 790, 350);
  // 마커 트레이
  ctx.fillStyle = '#c8c8c0';
  ctx.fillRect(0, 610, 1024, 30);
  return tex(c);
}

export function whiteboardBack() {
  const { c, ctx } = canvas(1024, 640);
  ctx.fillStyle = '#f7f7f2';
  ctx.fillRect(0, 0, 1024, 640);
  ctx.fillStyle = '#1f2a44';
  ctx.textBaseline = 'top';
  ctx.font = `bold 72px ${FONT_HAND}`;
  ctx.fillText('TODO', 60, 40);
  const items: [boolean, string][] = [
    [false, '리팩토링 (2019년부터 예정)'],
    [false, '테스트 코드 작성'],
    [false, '문서화'],
    [true, '일단 돌아가게 하기'],
  ];
  ctx.font = `bold 52px ${FONT_HAND}`;
  items.forEach(([done, text], i) => {
    const y = 150 + i * 105;
    ctx.strokeStyle = '#1f2a44';
    ctx.lineWidth = 5;
    ctx.strokeRect(70, y + 6, 46, 46);
    if (done) {
      ctx.strokeStyle = '#1e9e4a';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(78, y + 28);
      ctx.lineTo(94, y + 46);
      ctx.lineTo(124, y + 2);
      ctx.stroke();
    }
    ctx.fillStyle = done ? '#1e9e4a' : '#1f2a44';
    ctx.fillText(text, 146, y);
  });
  ctx.fillStyle = '#c8c8c0';
  ctx.fillRect(0, 610, 1024, 30);
  return tex(c);
}

export function menuBoard() {
  const { c, ctx } = canvas(800, 520);
  ctx.fillStyle = '#20241f';
  ctx.fillRect(0, 0, 800, 520);
  ctx.strokeStyle = '#8a6a44';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, 782, 502);
  ctx.fillStyle = '#f1ede0';
  ctx.textBaseline = 'top';
  ctx.font = `bold 64px ${FONT_HAND}`;
  ctx.textAlign = 'center';
  ctx.fillText('MENU', 400, 34);
  ctx.textAlign = 'left';
  const rows: [string, string][] = [
    ['아메리카노', '코드 1,000줄'],
    ['디카페인', '의미 없음'],
    ['에너지 드링크', '야근 필수템'],
    ['오늘의 라떼', 'NullPointer 라떼'],
    ['핫픽스 샷 추가', '+500원'],
  ];
  ctx.font = `bold 42px ${FONT_HAND}`;
  rows.forEach(([a, b], i) => {
    const y = 130 + i * 70;
    ctx.fillStyle = '#f1ede0';
    ctx.fillText(a, 60, y);
    ctx.fillStyle = '#f2c46b';
    ctx.textAlign = 'right';
    ctx.fillText(b, 740, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(241,237,224,0.3)';
    ctx.fillRect(60, y + 52, 680, 2);
  });
  return tex(c);
}

export function neonSign(text: string, color: string, w = 1024, h = 160) {
  const { c, ctx } = canvas(w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(h * 0.42)}px ${FONT_MONO}`;
  ctx.shadowColor = color;
  for (const blur of [40, 20, 8]) {
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.7;
  ctx.fillText(text, w / 2, h / 2);
  return tex(c);
}

export function dialectPoster() {
  const { c, ctx } = canvas(480, 640);
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(0, 0, 480, 640);
  ctx.fillStyle = '#26324a';
  ctx.fillRect(0, 0, 480, 120);
  ctx.fillStyle = '#efe6d2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 44px ${FONT_UI}`;
  ctx.fillText('판교 사투리 사전', 240, 62);
  const rows: [string, string][] = [
    ['얼라인', '맞춰보자'],
    ['싱크', '회의하자'],
    ['ASAP', '어제까지'],
    ['R&R', '네 일'],
    ['리소스', '사람'],
    ['디벨롭', '다시 해와'],
  ];
  ctx.textAlign = 'left';
  rows.forEach(([a, b], i) => {
    const y = 170 + i * 76;
    ctx.fillStyle = '#26324a';
    ctx.font = `800 36px ${FONT_UI}`;
    ctx.fillText(a, 40, y);
    ctx.fillStyle = '#6a5a3f';
    ctx.font = `500 32px ${FONT_UI}`;
    ctx.fillText('= ' + b, 230, y);
  });
  return tex(c);
}

export function stickyNote(lines: string[], bg = '#ffe680') {
  const { c, ctx } = canvas(320, 320);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 320, 320);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(0, 0, 320, 40);
  ctx.fillStyle = '#3a3220';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 46px ${FONT_HAND}`;
  lines.forEach((l, i) => ctx.fillText(l, 160, 160 + (i - (lines.length - 1) / 2) * 56));
  return tex(c);
}

export function smallSign(title: string, sub: string, bg = '#f4efe4', fg = '#2a2a2a') {
  const { c, ctx } = canvas(512, 256);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 60px ${FONT_UI}`;
  ctx.fillText(title, 256, 100);
  ctx.font = `500 34px ${FONT_UI}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(sub, 256, 180);
  return tex(c);
}

export function hazardStripes() {
  const { c, ctx } = canvas(256, 32);
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = '#1a1a1a';
  for (let x = -32; x < 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 16, 32);
    ctx.lineTo(x + 32, 0);
    ctx.lineTo(x + 16, 0);
    ctx.fill();
  }
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

export function doormat() {
  const { c, ctx } = canvas(512, 256);
  ctx.fillStyle = '#4a3b2c';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 256; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#d8c7a4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 64px ${FONT_MONO}`;
  ctx.fillText('WELCOME', 256, 100);
  ctx.font = `500 34px ${FONT_MONO}`;
  ctx.fillText('to production', 256, 172);
  return tex(c);
}

/** 서버랙 앞면 (LED는 따로 깜빡임) */
export function rackFace() {
  const { c, ctx } = canvas(256, 640);
  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 0, 256, 640);
  for (let y = 20; y < 620; y += 46) {
    ctx.fillStyle = '#23262e';
    ctx.fillRect(16, y, 224, 38);
    ctx.fillStyle = '#2d313b';
    for (let x = 30; x < 160; x += 10) ctx.fillRect(x, y + 10, 5, 18);
  }
  return tex(c);
}

/** 판교 오피스 창문. 밤새 불 켜진 '판교의 등대' */
export function officeWindows(litRatio: number, tint: 'warm' | 'cool') {
  const { c, ctx } = canvas(256, 512);
  ctx.fillStyle = '#0d1220';
  ctx.fillRect(0, 0, 256, 512);
  const cols = 8;
  const rows = 24;
  const cw = 256 / cols;
  const rh = 512 / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const lit = rnd() < litRatio;
      if (lit) {
        const warm = tint === 'warm' ? rnd() < 0.8 : rnd() < 0.25;
        const l = 60 + rnd() * 25;
        ctx.fillStyle = warm ? `hsl(${38 + rnd() * 10}, 85%, ${l}%)` : `hsl(${200 + rnd() * 20}, 60%, ${l}%)`;
      } else {
        ctx.fillStyle = `hsl(222, 25%, ${10 + rnd() * 6}%)`;
      }
      ctx.fillRect(i * cw + 4, j * rh + 4, cw - 8, rh - 7);
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function skyGradient() {
  const { c, ctx } = canvas(16, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#070a14');
  g.addColorStop(0.45, '#111a33');
  g.addColorStop(0.72, '#2a2448');
  g.addColorStop(1, '#3b2c4d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  return tex(c);
}

export function glowSprite(color: string) {
  const { c, ctx } = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color.replace(')', ',0.5)').replace('rgb', 'rgba'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return tex(c);
}

// ── git log TV ─────────────────────────────────────────────
export class GitLogScreen {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    const { c, ctx } = canvas(1024, 576);
    this.ctx = ctx;
    this.texture = tex(c);
    this.draw([]);
  }

  private title = '판교 새벽 카페';

  draw(commits: Commit[], title?: string) {
    if (title) this.title = title;
    const ctx = this.ctx;
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, 1024, 576);
    // 창 제목줄
    ctx.fillStyle = '#1d2029';
    ctx.fillRect(0, 0, 1024, 44);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(28 + i * 26, 22, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#7d8590';
    ctx.font = `500 20px ${FONT_MONO}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(`mogakco — zsh — ${this.title}`, 512, 22);
    ctx.textAlign = 'left';

    ctx.font = `500 24px ${FONT_MONO}`;
    ctx.fillStyle = '#7ee787';
    ctx.fillText('$', 24, 76);
    ctx.fillStyle = '#e6edf3';
    ctx.fillText('git log --oneline --graph', 50, 76);

    const list = commits.slice(0, 11);
    if (!list.length) {
      ctx.fillStyle = '#7d8590';
      ctx.fillText('* 0000000 Initial commit', 24, 120);
      ctx.fillText('  아직 남긴 커밋이 없어요. 첫 커밋의 주인공이 되어보세요.', 24, 160);
    }
    list.forEach((cm, i) => {
      const y = 120 + i * 38;
      let x = 24;
      ctx.fillStyle = '#f0883e';
      ctx.fillText('*', x, y);
      x += 28;
      ctx.fillStyle = '#e3b341';
      ctx.fillText(cm.hash, x, y);
      x += ctx.measureText(cm.hash).width + 14;
      if (i === 0) {
        ctx.fillStyle = '#79c0ff';
        const head = '(HEAD -> main)';
        ctx.fillText(head, x, y);
        x += ctx.measureText(head).width + 14;
      }
      ctx.fillStyle = '#e6edf3';
      let msg = cm.msg;
      const maxW = 1024 - x - 24 - 220;
      while (ctx.measureText(msg).width > maxW && msg.length > 4) msg = msg.slice(0, -2);
      if (msg !== cm.msg) msg += '…';
      ctx.fillText(msg, x, y);
      ctx.fillStyle = langById(cm.lang).color;
      ctx.textAlign = 'right';
      ctx.font = `500 20px ${FONT_MONO}`;
      let who = cm.name;
      while (ctx.measureText(who).width > 200 && who.length > 2) who = who.slice(0, -1);
      ctx.fillText(who, 1000, y);
      ctx.textAlign = 'left';
      ctx.font = `500 24px ${FONT_MONO}`;
    });
    this.texture.needsUpdate = true;
  }
}

export function brick() {
  const { c, ctx } = canvas(512, 512);
  ctx.fillStyle = '#3b2a24';
  ctx.fillRect(0, 0, 512, 512);
  const bh = 32;
  const bw = 96;
  for (let row = 0; row < 512 / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < 512 + bw; x += bw) {
      const l = 26 + rnd() * 12;
      ctx.fillStyle = `hsl(${10 + rnd() * 10}, ${34 + rnd() * 14}%, ${l}%)`;
      ctx.fillRect(x + off + 3, row * bh + 3, bw - 6, bh - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + off + 3, row * bh + bh - 9, bw - 6, 6);
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 2);
  return t;
}

export function clockFace(label: string) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#f3efe6';
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 8;
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.lineWidth = i % 3 === 0 ? 7 : 3;
    ctx.beginPath();
    ctx.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100);
    ctx.lineTo(128 + Math.sin(a) * 112, 128 - Math.cos(a) * 112);
    ctx.stroke();
  }
  ctx.fillStyle = '#2a2a2a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 30px ${FONT_MONO}`;
  ctx.fillText(label, 128, 176);
  return tex(c);
}

/** 캔버스에 그리는 글자들. 한글 웹폰트는 글자 단위로 나눠 받기 때문에 미리 요청해둬요 */
export const CANVAS_TEXT = {
  hand:
    'It works on my machine ¯\\_(ツ)_/¯ 금요일 배포 금지 앱 API DB 여기서 터짐 TODO 리팩토링 (2019년부터 예정) 테스트 코드 작성 문서화 일단 돌아가게 하기 ' +
    'MENU 아메리카노 코드 1,000줄 디카페인 의미 없음 에너지 드링크 야근 필수템 오늘의 라떼 NullPointer 라떼 핫픽스 샷 추가 +500원 판교의 등대는 오늘도 켜져 있다',
  ui:
    '판교 사투리 사전 얼라인 = 맞춰보자 싱크 회의하자 ASAP 어제까지 R&R 네 일 리소스 사람 디벨롭 다시 해와 Wi-Fi pangyo_mogakco PW 1q2w3e4r! ' +
    '서버는 UTC 타임존 버그 주의 COFFEE → CODE 커피를 코드로 바꾸는 곳 PROD 만지지 마시오 금요일 배포 버튼 누르지 마시오 러버덕 상담소 24시간 · 무료',
  mono: 'mogakco — zsh — 판교 새벽 카페 $ git log --oneline --graph * (HEAD -> main) 0123456789abcdef 아직 남긴 커밋이 없어요. 첫 커밋의 주인공이 되어보세요. while (alive) { code(); } WELCOME to production KST UTC </>',
};
