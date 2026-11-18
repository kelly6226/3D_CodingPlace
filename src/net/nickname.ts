// 한 방 안에서 같은 닉네임인지 보는 기준 (온라인·데모 모드와 화면이 같이 써요)

/**
 * 같은 닉네임으로 볼지 정하는 비교용 값.
 * 대소문자, 띄어쓰기, 전각/반각 차이로 사실상 같은 이름을 만들지 못하게 맞춰요 ("Kim Dev" = "kimdev" = "ｋｉｍ ｄｅｖ")
 */
function nicknameKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

export function isSameNickname(a: string, b: string): boolean {
  return nicknameKey(a) === nicknameKey(b);
}

/** 방 사람들 중에 이 닉네임을 쓰는 사람이 있는지 */
export function hasNickname(peers: readonly { name: string }[], name: string): boolean {
  return peers.some((p) => isSameNickname(p.name, name));
}
