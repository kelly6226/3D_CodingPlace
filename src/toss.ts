import { Environment, Share } from '@apps-in-toss/web-framework';

/** 앱인토스 콘솔에 등록한 appName. 공유 링크(intoss://<appName>)에 들어가요. */
const TOSS_APP_NAME = 'code-alone-together';

/** 공유 링크로 들어왔을 때 처음 진입 주소에 담긴 방 이름. 없으면 빈 문자열 */
export function entryRoomParam(): string {
  try {
    return new URL(Environment.initialURL).searchParams.get('room') ?? '';
  } catch {
    return '';
  }
}

/** 토스 앱에서 이 방이 바로 열리는 공유 링크 */
function createRoomLink(slug: string): Promise<string> {
  return Share.createLink({ path: `intoss://${TOSS_APP_NAME}?room=${slug}` });
}

/** 방 링크를 만들어 토스 공유 시트를 열어요. 실패하면 throw */
export async function shareRoom(slug: string, roomName: string): Promise<void> {
  const link = await createRoomLink(slug);
  await Share.sendMessage({ message: `"${roomName}" 방에서 같이 모각코 해요 👉\n${link}` });
}
