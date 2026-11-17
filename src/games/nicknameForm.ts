// 게임만 따로 연 페이지의 목록 맨 위: 스코어 판에 올라갈 닉네임 칸
import { NICKNAME_MAX } from '../config';
import { h } from '../ui/dom';
import { readOrCreatePlayer, renamePlayer } from './playerTag';

export function nicknameForm(): HTMLElement {
  const input = h('input', { id: 'games-nick', maxlength: NICKNAME_MAX, value: readOrCreatePlayer().name, autocomplete: 'off', spellcheck: 'false' });
  const message = h('p', { class: 'games-nick-msg', 'aria-live': 'polite' }, '');
  return h(
    'form',
    {
      class: 'games-nick',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const result = renamePlayer(input.value);
        message.classList.toggle('bad', !result.ok);
        if (!result.ok) {
          message.textContent = result.reason;
          input.focus();
          return;
        }
        input.value = readOrCreatePlayer().name;
        message.textContent = '바꿨어요. 다음 점수부터 이 닉네임으로 올라가요.';
      },
    },
    h('label', { for: 'games-nick' }, '스코어 판 닉네임'),
    h('div', { class: 'games-nick-row' }, input, h('button', { type: 'submit', class: 'ghost' }, '바꾸기')),
    message,
  );
}
