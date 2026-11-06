// 개인정보 처리방침을 앱 안에서 보여주기
//
// 앱인토스는 토스 도메인 밖의 자사 사이트로 이동하거나 그 내용을 불러와 그리는 걸 막아요(비게임 출시 체크리스트).
// 그래서 Vercel 페이지로 열지 않고, 앱 번들에 같이 들어 있는 public/privacy.html을 읽어 시트에 그려요.
// 내용은 그 파일 하나만 고치면 웹과 앱이 같이 바뀌어요.

/** 처방침 원문. 빌드 결과물의 맨 위에 같이 들어가요 (public/privacy.html) */
const PRIVACY_PAGE_PATH = '/privacy.html';

/** 처방침 본문을 시트에 넣을 조각으로 돌려줘요. 못 읽으면 throw */
export async function loadPrivacyPolicy(): Promise<DocumentFragment> {
  const res = await fetch(PRIVACY_PAGE_PATH);
  if (!res.ok) throw new Error(`처방침을 못 읽었어요 (${res.status})`);
  // DOMParser로 만든 문서는 스크립트가 실행되지 않아요
  const page = new DOMParser().parseFromString(await res.text(), 'text/html');
  const main = page.querySelector('main');
  if (!main) throw new Error('처방침 본문(main)이 없어요');

  const body = document.createDocumentFragment();
  for (const el of main.children) {
    // 제목은 시트 머리글이 대신하고, 돌아가기 링크는 앱 안에서는 필요 없어요
    if (el.matches('h1, a.back')) continue;
    body.append(document.importNode(el, true));
  }
  stopLinksFromLeaving(body);
  return body;
}

/** 누르면 앱 밖으로 나가 버리는 링크를 글자로 바꿔요. 주소는 보이게 남겨서 직접 찾아갈 수 있어요 */
function stopLinksFromLeaving(root: DocumentFragment) {
  for (const a of root.querySelectorAll('a')) {
    const href = a.getAttribute('href') ?? '';
    const label = a.textContent ?? '';
    const isWebLink = /^https?:\/\//.test(href);
    const address = href.replace(/^https?:\/\//, '').replace(/\/$/, '');
    a.replaceWith(isWebLink ? `${label} (${address})` : label);
  }
}
