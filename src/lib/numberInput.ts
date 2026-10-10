// 数値入力欄を空欄のまま編集できるようにする（バックスペースで0が残らない問題の対策）。
// 入力欄のstateは文字列で持ち、数値が必要な箇所でこの関数を使ってパースする。
export const parseIntInput = (v: string): number => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
};
