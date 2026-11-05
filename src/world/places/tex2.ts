// 새 장소들(서버실·원룸·해커톤장)에서 쓰는 캔버스 텍스처
import * as THREE from 'three';
import { FONT_HAND, FONT_MONO, FONT_UI, canvas, tex } from '../textures';

let seed = 11;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** 서버실 이중 바닥 타일 (구멍 뚫린 통풍 타일 섞임) */
export function raisedFloor() {
  const { c, ctx } = canvas(512, 512);
  const n = 4;
  const s = 512 / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const vent = (i + j * 3) % 5 === 0;
      ctx.fillStyle = vent ? '#5d6470' : `hsl(220, 8%, ${44 + rnd() * 6}%)`;
      ctx.fillRect(i * s, j * s, s, s);
      if (vent) {
        ctx.fillStyle = '#2b3038';
        for (let y = 10; y < s - 6; y += 12) for (let x = 10; x < s - 6; x += 12) ctx.fillRect(i * s + x, j * s + y, 5, 5);
      }
      ctx.strokeStyle = '#2a2f36';
      ctx.lineWidth = 4;
      ctx.strokeRect(i * s + 2, j * s + 2, s - 4, s - 4);
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2.25);
  return t;
}

/** 행사장 카펫 */
export function carpet(base: string, accent: string) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(0, 40 + k * 64);
    ctx.bezierCurveTo(80, k * 64, 170, 80 + k * 64, 256, 40 + k * 64);
    ctx.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 4);
  return t;
}

/** 원룸 장판 */
export function linoleum() {
  const { c, ctx } = canvas(512, 512);
  ctx.fillStyle = '#b8955f';
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) {
    ctx.fillStyle = `rgba(80,50,20,${0.08 + rnd() * 0.06})`;
    ctx.fillRect(0, y, 512, 64);
    ctx.fillStyle = 'rgba(60,35,10,0.25)';
    ctx.fillRect(0, y, 512, 2);
    for (let k = 0; k < 6; k++) {
      ctx.strokeStyle = 'rgba(70,40,15,0.12)';
      ctx.beginPath();
      const yy = y + 8 + rnd() * 48;
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(170, yy + 4, 340, yy - 4, 512, yy);
      ctx.stroke();
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1.5);
  return t;
}

/** 원룸 벽지 (작은 꽃무늬, 살짝 누렇게) */
export function wallpaper() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#d8d2c2';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(150,140,110,0.25)';
  for (let y = 16; y < 256; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < 256; x += 32) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1.5);
  return t;
}

/** 위에 글자 한두 줄 쓴 판 (텐트 카드, 배너 등) */
export function label(lines: string[], bg: string, fg: string, w = 512, h = 192, font = FONT_UI, weight = 800) {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.round((h / (lines.length + 0.6)) * 0.62);
  lines.forEach((l, i) => {
    ctx.font = `${i === 0 ? weight : 500} ${i === 0 ? size : Math.round(size * 0.75)}px ${font}`;
    ctx.globalAlpha = i === 0 ? 1 : 0.8;
    ctx.fillText(l, w / 2, (h / (lines.length + 1)) * (i + 1));
  });
  ctx.globalAlpha = 1;
  return tex(c);
}

/** 해커톤 아이디어 벽: 포스트잇 잔뜩 */
export function ideaWall() {
  const { c, ctx } = canvas(1024, 512);
  ctx.fillStyle = '#ece8df';
  ctx.fillRect(0, 0, 1024, 512);
  const ideas = ['배달앱인데 AI', '당근인데 블록체인', '노션 클론', '모각코 매칭', '고양이 SNS', '회의 요약봇', '점심 메뉴 추천', '코드리뷰 자동', '메타버스 사무실', '중고 키보드 마켓', '스터디 출석부', '할 일 앱 (8번째)', '영수증 OCR', '날씨 + 코디', '퇴근 타이머'];
  const colors = ['#ffe680', '#ffb3c7', '#a7e3ff', '#b9f0a7', '#ffd0a0'];
  let k = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const x = 30 + col * 198 + (rnd() - 0.5) * 20;
      const y = 26 + row * 160 + (rnd() - 0.5) * 16;
      ctx.save();
      ctx.translate(x + 80, y + 64);
      ctx.rotate((rnd() - 0.5) * 0.12);
      ctx.fillStyle = colors[k % colors.length];
      ctx.fillRect(-80, -64, 160, 128);
      ctx.fillStyle = '#3a3220';
      ctx.font = `bold 30px ${FONT_HAND}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ideas[k % ideas.length], 0, 0);
      ctx.restore();
      k++;
    }
  }
  // 딱 하나만 체크됨
  ctx.strokeStyle = '#1e9e4a';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(30 + 3 * 198 + 80, 26 + 160 + 64, 92, 0, Math.PI * 2);
  ctx.stroke();
  return tex(c);
}

/** 원룸 벽 포스터: 오늘 할 일 */
export function todoPoster() {
  const { c, ctx } = canvas(400, 520);
  ctx.fillStyle = '#fbf7ec';
  ctx.fillRect(0, 0, 400, 520);
  ctx.fillStyle = '#2a2a2a';
  ctx.font = `bold 52px ${FONT_HAND}`;
  ctx.textBaseline = 'top';
  ctx.fillText('오늘 할 일', 36, 30);
  const items: [boolean, string][] = [
    [true, '알고리즘 1문제'],
    [false, '이력서 고치기'],
    [false, '사이드 프로젝트'],
    [false, '빨래 개기'],
    [false, '일찍 자기'],
  ];
  ctx.font = `bold 38px ${FONT_HAND}`;
  items.forEach(([done, t], i) => {
    const y = 120 + i * 74;
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 4;
    ctx.strokeRect(36, y + 4, 34, 34);
    if (done) {
      ctx.strokeStyle = '#d62f2f';
      ctx.beginPath();
      ctx.moveTo(40, y + 20);
      ctx.lineTo(52, y + 34);
      ctx.lineTo(74, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#2a2a2a';
    ctx.fillText(t, 88, y);
    if (i === 4) {
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(84, y + 22);
      ctx.lineTo(260, y + 22);
      ctx.stroke();
    }
  });
  return tex(c);
}

/** 서버실 자판기 앞면 (0.9 × 1.85m) */
export function vendingFace() {
  const { c, ctx } = canvas(360, 740);
  ctx.fillStyle = '#d9dee5';
  ctx.fillRect(0, 0, 360, 740);
  ctx.fillStyle = '#2b6cff';
  ctx.fillRect(0, 0, 360, 92);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 46px ${FONT_UI}`;
  ctx.fillText('음료', 180, 48);
  ctx.fillStyle = '#0f1724';
  ctx.fillRect(22, 110, 316, 424);
  const cans = ['#e8433a', '#1fbf6a', '#2b6cff', '#f2c230', '#7a4aff', '#f4f4f4'];
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 5; k++) {
      const x = 40 + k * 58;
      const y = 126 + r * 102;
      ctx.fillStyle = cans[(r * 5 + k * 2) % cans.length];
      ctx.fillRect(x, y, 40, 70);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 6, y + 6, 6, 58);
      ctx.fillStyle = r === 2 && k === 3 ? '#555' : '#ff5a52';
      ctx.fillRect(x + 8, y + 78, 24, 10);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(22, 110);
  ctx.lineTo(150, 110);
  ctx.lineTo(22, 380);
  ctx.fill();
  ctx.fillStyle = '#2a2f36';
  ctx.fillRect(246, 560, 76, 116);
  ctx.fillStyle = '#7ee787';
  ctx.font = `600 22px ${FONT_MONO}`;
  ctx.fillText('1,500', 284, 586);
  ctx.fillStyle = '#11151b';
  ctx.fillRect(268, 616, 34, 6);
  ctx.fillRect(262, 646, 46, 14);
  ctx.fillStyle = '#1a1d22';
  ctx.fillRect(36, 640, 190, 72);
  ctx.fillStyle = '#6a707a';
  ctx.font = `600 18px ${FONT_UI}`;
  ctx.fillText('꺼내는 곳', 131, 676);
  return tex(c);
}

/** 서버실 항온항습기 앞면 (1.5 × 2.1m) */
export function cracFace() {
  const { c, ctx } = canvas(600, 840);
  ctx.fillStyle = '#c9cbc5';
  ctx.fillRect(0, 0, 600, 840);
  ctx.strokeStyle = '#9a9c96';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 584, 824);
  ctx.beginPath();
  ctx.moveTo(300, 8);
  ctx.lineTo(300, 832);
  ctx.stroke();
  ctx.fillStyle = '#1b2a22';
  ctx.fillRect(60, 70, 190, 120);
  ctx.fillStyle = '#7ee787';
  ctx.textBaseline = 'middle';
  ctx.font = `700 46px ${FONT_MONO}`;
  ctx.fillText('18.0°C', 74, 116);
  ctx.font = `500 20px ${FONT_MONO}`;
  ctx.fillText('RH 45%  COOL', 76, 166);
  ctx.fillStyle = '#4a4c48';
  ctx.font = `700 28px ${FONT_MONO}`;
  ctx.fillText('CRAC-01', 360, 100);
  for (let y = 300; y < 800; y += 22) {
    ctx.fillStyle = '#8f918b';
    ctx.fillRect(40, y, 520, 10);
    ctx.fillStyle = '#b4b6b0';
    ctx.fillRect(40, y + 10, 520, 3);
  }
  return tex(c);
}

/** 원룸 창밖: 맞은편 건물과 24시 편의점 */
export function nightStreet() {
  const { c, ctx } = canvas(512, 384);
  const g = ctx.createLinearGradient(0, 0, 0, 384);
  g.addColorStop(0, '#0a0e1c');
  g.addColorStop(1, '#1b1730');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 384);
  // 맞은편 빌라
  ctx.fillStyle = '#26252e';
  ctx.fillRect(30, 40, 452, 344);
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 5; i++) {
      const lit = (i * 7 + j * 3) % 6 === 0;
      ctx.fillStyle = lit ? '#f2c477' : '#17161d';
      ctx.fillRect(58 + i * 86, 62 + j * 62, 54, 38);
    }
  }
  // 편의점 간판
  ctx.fillStyle = '#e8f6ff';
  ctx.fillRect(70, 312, 372, 52);
  ctx.fillStyle = '#1f8f5a';
  ctx.fillRect(70, 312, 372, 12);
  ctx.fillStyle = '#1a3a7a';
  ctx.font = `800 30px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('24시 편의점', 256, 344);
  return tex(c);
}

/** 피자 박스 뚜껑 */
export function pizzaLid() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#d9b27c';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#b38652';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 236, 236);
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(128, 116, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 40px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PIZZA', 128, 118);
  ctx.fillStyle = '#7a5530';
  ctx.font = `600 22px ${FONT_UI}`;
  ctx.fillText('HOT & FRESH', 128, 206);
  return tex(c);
}

/** 서버실 모니터링 대시보드 (그래프가 움직임) */
export class DashboardScreen {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private series: number[][] = [[], [], []];
  private t = 0;
  constructor() {
    const { c, ctx } = canvas(768, 432);
    this.ctx = ctx;
    this.texture = tex(c);
    for (const s of this.series) for (let i = 0; i < 60; i++) s.push(0.3 + rnd() * 0.4);
    this.draw(false);
  }
  update(dt: number, alarming: boolean) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    this.series.forEach((s, k) => {
      s.shift();
      const last = s[s.length - 1];
      const target = alarming ? 0.95 : k === 0 ? 0.92 : 0.45;
      s.push(Math.max(0.05, Math.min(1, last + (target - last) * 0.1 + (rnd() - 0.5) * 0.12)));
    });
    this.draw(alarming);
  }
  private draw(alarming: boolean) {
    const ctx = this.ctx;
    ctx.fillStyle = '#111318';
    ctx.fillRect(0, 0, 768, 432);
    ctx.fillStyle = '#e6edf3';
    ctx.font = `600 22px ${FONT_MONO}`;
    ctx.textBaseline = 'top';
    ctx.fillText('prod-cluster / overview', 20, 14);
    const panels: [string, string][] = [
      ['CPU', '#f2b45a'],
      ['latency p99', '#58a6ff'],
      ['error rate', '#ff5a52'],
    ];
    panels.forEach(([name, color], k) => {
      const x = 20;
      const y = 54 + k * 120;
      ctx.fillStyle = '#181b22';
      ctx.fillRect(x, y, 500, 108);
      ctx.fillStyle = '#7d8590';
      ctx.font = `500 16px ${FONT_MONO}`;
      ctx.fillText(name, x + 10, y + 8);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      this.series[k].forEach((v, i) => {
        const px = x + 10 + (i / 59) * 480;
        const py = y + 100 - v * 70;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.stroke();
    });
    // 알람 목록
    ctx.fillStyle = alarming ? '#3a0d0d' : '#181b22';
    ctx.fillRect(536, 54, 212, 348);
    ctx.font = `600 17px ${FONT_MONO}`;
    ctx.fillStyle = '#ff5a52';
    ctx.fillText(alarming ? '● POWER LOST' : '● 37 alerts', 548, 66);
    ctx.font = `500 15px ${FONT_MONO}`;
    ctx.fillStyle = '#c9d1d9';
    const alerts = alarming
      ? ['rack-A all down', 'UPS on battery', 'who pressed EPO', 'call oncall NOW']
      : ['disk /var 98%', 'cert expires 3d', 'cpu > 90% (매일)', 'legacy-01 ???', 'cron failed'];
    alerts.forEach((a, i) => ctx.fillText(a, 548, 102 + i * 30));
    this.texture.needsUpdate = true;
  }
}

/** 해커톤 카운트다운 전광판: 다음 오전 10시(KST)까지 */
export class CountdownScreen {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private t = 0;
  constructor() {
    const { c, ctx } = canvas(1024, 400);
    this.ctx = ctx;
    this.texture = tex(c);
    this.draw(false);
  }
  update(dt: number, alarming: boolean) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    this.draw(alarming);
  }
  private draw(alarming: boolean) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 1024, 400);
    g.addColorStop(0, alarming ? '#3a0a12' : '#1a1240');
    g.addColorStop(1, alarming ? '#200508' : '#0b1a3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 400);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#b9a8ff';
    ctx.font = `700 34px ${FONT_MONO}`;
    ctx.fillText(alarming ? 'SUBMISSION SERVER DOWN' : '데모까지', 512, 70);
    // KST 기준 다음 10:00까지 남은 시간
    const kst = new Date(Date.now() + 9 * 3600e3);
    const next = new Date(kst);
    next.setUTCHours(10, 0, 0, 0);
    if (next <= kst) next.setUTCDate(next.getUTCDate() + 1);
    const left = Math.max(0, next.getTime() - kst.getTime());
    const hh = String(Math.floor(left / 3600e3)).padStart(2, '0');
    const mm = String(Math.floor((left % 3600e3) / 60e3)).padStart(2, '0');
    const ss = String(Math.floor((left % 60e3) / 1000)).padStart(2, '0');
    ctx.fillStyle = alarming ? '#ff5a52' : '#ffffff';
    ctx.shadowColor = alarming ? '#ff2a2a' : '#7c6cff';
    ctx.shadowBlur = 30;
    ctx.font = `700 150px ${FONT_MONO}`;
    ctx.fillText(alarming ? '00:00:00' : `${hh}:${mm}:${ss}`, 512, 210);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#8b93a8';
    ctx.font = `500 28px ${FONT_UI}`;
    ctx.fillText('발표 자료: Lorem ipsum dolor sit amet', 512, 340);
    this.texture.needsUpdate = true;
  }
}

export const TEX2_TEXT =
  '배달앱인데 AI 당근인데 블록체인 노션 클론 모각코 매칭 고양이 SNS 회의 요약봇 점심 메뉴 추천 코드리뷰 자동 메타버스 사무실 중고 키보드 마켓 스터디 출석부 할 일 앱 (8번째) 영수증 OCR 날씨 + 코디 퇴근 타이머 ' +
  '음료 꺼내는 곳 1,500 18.0°C RH 45% COOL CRAC-01 24시 편의점 PIZZA HOT & FRESH ' +
  '오늘 할 일 알고리즘 1문제 이력서 고치기 사이드 프로젝트 빨래 개기 일찍 자기 데모까지 발표 자료: Lorem ipsum dolor sit amet (매일)';
