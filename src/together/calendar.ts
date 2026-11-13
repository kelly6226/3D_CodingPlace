// '내 모각코 시간'을 캘린더 일정으로: 매일 그 시각(KST) 정각에 50분, 5분 전 알림.
// 서버도 계정도 필요 없어요. 사용자 캘린더 앱이 대신 알려줘요.
import { FOCUS_MINUTES } from './session';

const KST_OFFSET_MS = 9 * 3600e3;
const TITLE = '온라인 모각코 🎯';
/** 일정 시작 몇 분 전에 알릴지 */
const REMIND_BEFORE_MINUTES = 5;

/** 다음에 오는 그 시각(KST)의 정각. 이미 지났으면 내일 */
export function nextHourStart(hour: number, now: number): number {
  const kst = new Date(now + KST_OFFSET_MS);
  const start = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), hour) - KST_OFFSET_MS;
  return start > now ? start : start + 24 * 3600e3;
}

/** 20261114T220000 (KST 벽시계 시각) */
function kstStamp(at: number): string {
  return new Date(at + KST_OFFSET_MS).toISOString().replace(/[-:]/g, '').slice(0, 15);
}

/** 20261113T031500Z (UTC) */
function utcStamp(at: number): string {
  return new Date(at).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
}

/** iCalendar 글자 이스케이프 (RFC 5545 3.3.11) */
function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** 한 줄이 75바이트를 넘으면 접어요 (RFC 5545 3.1). 한글은 3바이트라 글자 단위로 잘라요 */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    // 이어지는 줄은 맨 앞 공백 1바이트를 먹어요
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + b > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** 매일 반복하는 일정 파일(.ics) 내용 */
export function dailyIcs(hour: number, roomLink: string, now: number): string {
  const start = nextHourStart(hour, now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//code-alone-together//online-mogakco//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Seoul',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:KST',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:mogakco-daily-${hour}@code-alone-together`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=Asia/Seoul:${kstStamp(start)}`,
    `DURATION:PT${FOCUS_MINUTES}M`,
    'RRULE:FREQ=DAILY',
    `SUMMARY:${icsText(TITLE)}`,
    `DESCRIPTION:${icsText(`정각에 다 같이 ${FOCUS_MINUTES}분 집중해요.\n${roomLink}`)}`,
    `URL:${roomLink}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:-PT${REMIND_BEFORE_MINUTES}M`,
    `DESCRIPTION:${icsText(`${REMIND_BEFORE_MINUTES}분 뒤 모각코 시작`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** 구글 캘린더 '일정 만들기' 화면 주소 (안드로이드·PC에서 .ics보다 편해요) */
export function googleCalendarUrl(hour: number, roomLink: string, now: number): string {
  const start = nextHourStart(hour, now);
  const end = start + FOCUS_MINUTES * 60e3;
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: TITLE,
    dates: `${kstStamp(start)}/${kstStamp(end)}`,
    ctz: 'Asia/Seoul',
    recur: 'RRULE:FREQ=DAILY',
    details: `정각에 다 같이 ${FOCUS_MINUTES}분 집중해요.\n${roomLink}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
