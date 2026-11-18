// 다른 탭·창·앱을 보고 있을 때 온 채팅 알리기: 탭 제목의 안 읽은 수, 짧은 알림음, (켠 사람만) 브라우저 알림.
// 브라우저 알림은 이 탭이 열려 있는 동안 페이지가 직접 띄워요 (푸시 서버·서비스 워커 없음).

/** 연달아 오면 알림음과 브라우저 알림은 이 간격에 한 번만 (탭 제목 숫자는 매번 늘어요) */
const BURST_MS = 5000;
/** 같은 태그로 띄워서 브라우저 알림이 쌓이지 않고 마지막 것으로 바뀌어요 */
const NOTIFY_TAG = 'mogakco-chat';
const NOTIFY_ICON = '/apple-touch-icon.png';

export interface AwayChat {
  name: string;
  text: string;
  /** 귓속말이면 알림에 내용을 보여주지 않아요 (잠금 화면·화면 공유에 보일 수 있어서) */
  whisper: boolean;
}

/**
 * 브라우저 알림 상태.
 * blocked: 브라우저 설정에서 이 사이트 알림을 막음. unsupported: 페이지에서 알림을 못 띄우는 브라우저
 * (안드로이드 크롬은 서비스 워커로만 띄울 수 있고, 아이폰은 홈 화면에 추가한 웹 앱에서만 돼요)
 */
export type ChatNotifyState = 'on' | 'off' | 'blocked' | 'unsupported';

const notificationApi = (): typeof Notification | null => ('Notification' in window ? Notification : null);

/** 저장된 설정(켜고 싶은지)과 브라우저 권한을 합친 지금 상태 */
export function chatNotifyState(wanted: boolean): ChatNotifyState {
  const api = notificationApi();
  if (!api) return 'unsupported';
  if (api.permission === 'denied') return 'blocked';
  return wanted && api.permission === 'granted' ? 'on' : 'off';
}

/**
 * 브라우저 알림 켜기. 권한을 아직 안 물었으면 물어요 (버튼을 누른 직후에만 불러요).
 * 켜지면 확인용 알림을 하나 띄우는데, 그게 안 되는 브라우저면 unsupported예요
 */
export async function turnOnChatNotify(): Promise<ChatNotifyState> {
  const api = notificationApi();
  if (!api) return 'unsupported';
  const permission = api.permission === 'default' ? await api.requestPermission() : api.permission;
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'off';
  return showNotification('🔔 채팅 알림을 켰어요', '다른 창에 있을 때 채팅이 오면 이렇게 알려드릴게요') ? 'on' : 'unsupported';
}

/** 띄웠으면 true. 누르면 이 탭으로 돌아와요 */
function showNotification(title: string, body: string): boolean {
  try {
    const n = new Notification(title, { body, tag: NOTIFY_TAG, icon: NOTIFY_ICON });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    // 안드로이드 크롬 등: 'Illegal constructor. Use ServiceWorkerRegistration.showNotification()'
    return false;
  }
}

/** 탭이 숨겨졌거나 다른 창·앱을 보고 있는지 */
const isAway = () => document.visibilityState === 'hidden' || !document.hasFocus();

export class AwayChatAlerts {
  private baseTitle = document.title;
  private unread = 0;
  private lastAlertAt = 0;

  constructor(
    private opts: {
      /** 짧은 알림음 (소리를 꺼 두었으면 안 나요) */
      ping(): void;
      /** 지금 브라우저 알림을 띄워도 되는지 */
      notifyOn(): boolean;
    },
  ) {
    const comeBack = () => {
      if (!isAway()) this.clearUnread();
    };
    document.addEventListener('visibilitychange', comeBack);
    addEventListener('focus', comeBack);
  }

  /** 방 이름이 들어간 원래 탭 제목. 안 읽은 채팅이 있으면 앞에 (n)을 붙여 보여줘요 */
  setBaseTitle(title: string) {
    this.baseTitle = title;
    this.paintTitle();
  }

  /** 다른 창에 있을 때 채팅이 오면 알려요. 이 탭을 보고 있으면 아무것도 안 해요 */
  alertIfAway(chat: AwayChat) {
    if (!isAway()) return;
    this.unread++;
    this.paintTitle();
    const now = Date.now();
    if (now - this.lastAlertAt < BURST_MS) return;
    this.lastAlertAt = now;
    this.opts.ping();
    if (this.opts.notifyOn()) showNotification(...notificationText(chat, this.unread));
  }

  private clearUnread() {
    this.unread = 0;
    this.paintTitle();
  }

  private paintTitle() {
    document.title = this.unread > 0 ? `(${this.unread}) ${this.baseTitle}` : this.baseTitle;
  }
}

function notificationText(chat: AwayChat, unread: number): [title: string, body: string] {
  const more = unread > 1 ? `\n안 읽은 채팅 ${unread}개` : '';
  if (chat.whisper) return ['🤫 귓속말', `${chat.name}님이 귓속말을 보냈어요${more}`];
  return [`💬 ${chat.name}`, `${chat.text}${more}`];
}
