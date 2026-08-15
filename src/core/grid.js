// 공간 해시 그리드 — 충돌 브로드페이즈.
// 적 220 × 투사체 300 전수 비교(66,000회/프레임)를 주변 3×3 셀 조회로 줄인다.

const OFFSET = 32768;   // 음수 좌표를 정수 키로 안전하게 접기 위한 오프셋

export function createGrid(cell) {
  /** @type {Map<number, object[]>} */
  const map = new Map();

  function key(cx, cy) {
    return (cx + OFFSET) * 65536 + (cy + OFFSET);
  }

  return {
    clear() {
      // Map 자체를 버리면 GC 부담이 커지므로 버킷 배열을 재사용한다.
      for (const bucket of map.values()) bucket.length = 0;
    },

    insert(o) {
      const cx = Math.floor(o.x / cell);
      const cy = Math.floor(o.y / cell);
      const k = key(cx, cy);
      let bucket = map.get(k);
      if (!bucket) { bucket = []; map.set(k, bucket); }
      bucket.push(o);
    },

    /** (x,y) 반경 r 안에 있을 수 있는 후보를 콜백으로 넘긴다. 정밀 판정은 호출자 몫. */
    query(x, y, r, cb) {
      const x0 = Math.floor((x - r) / cell);
      const x1 = Math.floor((x + r) / cell);
      const y0 = Math.floor((y - r) / cell);
      const y1 = Math.floor((y + r) / cell);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const bucket = map.get(key(cx, cy));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) cb(bucket[i]);
        }
      }
    },
  };
}
