// 제네릭 오브젝트 풀.
// 활성 객체는 배열 앞쪽 [0, n) 구간에 몰아둔다. 삭제는 alive=false 표시만 하고
// compact()가 프레임 끝에 swap-remove 로 정리한다.
// (순회 도중 스폰/삭제가 일어나도 안전해야 하기 때문에 즉시 제거하지 않는다.)

export function createPool(factory, capacity) {
  const arr = new Array(capacity);
  for (let i = 0; i < capacity; i++) {
    arr[i] = factory();
    arr[i].alive = false;
  }
  let n = 0;

  return {
    items: arr,
    capacity,
    get count() { return n; },

    /** 비활성 슬롯을 활성화해 반환. 가득 찼으면 가장 오래된 것을 재사용한다. */
    spawn() {
      if (n >= capacity) {
        const o = arr[0];
        o.alive = true;
        return o;
      }
      const o = arr[n++];
      o.alive = true;
      return o;
    },

    forEach(fn) {
      for (let i = 0; i < n; i++) {
        const o = arr[i];
        if (o.alive) fn(o);
      }
    },

    /** 죽은 슬롯을 뒤로 밀어낸다. O(n), 프레임당 1회. */
    compact() {
      for (let i = n - 1; i >= 0; i--) {
        if (!arr[i].alive) {
          const tmp = arr[i];
          arr[i] = arr[n - 1];
          arr[n - 1] = tmp;
          n--;
        }
      }
    },

    clear() {
      for (let i = 0; i < capacity; i++) arr[i].alive = false;
      n = 0;
    },
  };
}
