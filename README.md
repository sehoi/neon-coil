# NEON COIL

브라우저에서 바로 돌아가는 성장 경쟁 액션(slither.io 계열). **서버 없이** NPC 19기와 겨룬다.
빌드 도구·외부 라이브러리·에셋 파일이 하나도 없다 — 그래픽은 Canvas 벡터, 사운드는 WebAudio 절차 생성.

자매작 [NEON PURGE](https://github.com/sehoi/neon-purge)의 코어 모듈과 성능 교훈을 그대로 물려받았다.

### ▶ [지금 플레이하기](https://sehoi.github.io/neon-coil/)

## 로컬에서 실행

```bash
node serve.mjs
```

그 다음 브라우저에서 http://localhost:5173 을 연다. (`PORT` 환경변수로 바꿀 수 있다)

> ES 모듈은 `file://` 에서 CORS 로 막히므로 `index.html` 을 더블클릭하면 동작하지 않는다.

## 조작

| 입력 | 동작 |
|---|---|
| 마우스 이동 | 머리가 포인터 쪽을 향한다 |
| 클릭 / `Space` / `Shift` | 가속 — 길이를 태워 빨라진다 |
| `Esc` / `P` | 일시정지 |
| `M` / `G` | 음소거 / 글로우 전환 |

### 모바일
가로 모드로 플레이한다. 화면 왼쪽을 드래그해 조종하고, 오른쪽 아래 원으로 가속한다.
시작할 때 전체화면을 자동 요청하고, 논리 폭을 화면 비율에 맞춰 늘려 검은 띠를 없앤다.

## 규칙

- **내 머리가 남의 몸에 닿으면 터진다.** 내 몸에는 닿아도 안전하다.
- 남이 내 몸에 박으면 그쪽이 터지고, 잔해는 전부 먹이가 된다.
- 경계 밖으로 나가면 즉사한다.
- 가속은 길이를 태우고, 태운 만큼 꼬리에서 조각이 흘러나온다 (남이 주울 수 있다).
- **길수록 강하지만 길수록 둔해진다.** 회전 속도가 길이에 반비례한다.

## 구조

```
index.html · style.css · serve.mjs
src/
  main.js        루프 + 상태 머신
  config.js      상수 · 동적 해상도 · 터치 판별
  core/          input · audio · rng · pool · grid · vec · save     [NEON PURGE 이식]
  game/          world · coil · ai · food · collide · camera · particle
  data/          tuning(모든 밸런싱 수치) · names
  render/        renderer · shapes
  ui/            hud · screens · widgets
docs/
  GAME_DESIGN.md   기획서
  ARCHITECTURE.md  기술 설계
```

밸런싱은 [src/data/tuning.js](src/data/tuning.js) 한 파일에 모여 있다.

## 성능

실측(코일 20기, 총 세그먼트 8,400여 개, 먹이 1,600여 개):

| 조건 | p50 | p90 | p99 |
|---|---|---|---|
| 데스크톱 1280×720 | 3.9 ms | 7.7 ms | 9.4 ms |
| 모바일 1480×720 (DPR 1.25) | 4.1 ms | 6.1 ms | 9.0 ms |

핵심은 **코일 몸통을 폴리라인 한 번의 stroke 로 그리는 것**이다. 세그먼트를 원으로 하나씩 그리면 8,400 draw call 이지만, 폴리라인이면 코일당 2회(외곽 번짐 + 코어) 총 40회로 끝난다. 자세한 내용은 [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 디버그 훅

```js
NC.start()        // 즉시 시작
NC.step(10)       // rAF 없이 10초분 시뮬레이션
NC.grow(40)       // 모든 코일을 40초분 키운다 (성능 측정용)
NC.godMode()      // 플레이어 무적
NC.world          // 월드 상태 전체
NC.viewport       // 현재 논리 해상도와 터치 UI 좌표
```

## 현재 상태

기획서의 M0~M6 구현 완료 — 궤적 몸통, 먹이·성장, 충돌·사망, NPC 19기(성격 3종)와 리스폰, 가속, 리더보드·미니맵·경계, 모바일 조작과 HUD.

검증한 것: 경계·몸통 충돌 사망, 내 몸에 박은 NPC 처치와 잔해 생성, 자기 몸 안전(길이 273으로 제자리 선회), 가속의 길이 소모(2초에 11)·속도 1.79배·꼬리 누출, 마우스/조이스틱 조종 수렴, 터치 HUD 5종, 화면 5종 렌더.

남은 것:
- **사람 손으로 하는 밸런싱** — 지금 수치는 시뮬레이션으로만 확인했다
- NPC 난이도 조정 (지금은 자기들끼리도 자주 죽는다)
- 업적 (NEON PURGE에서 검증된 구조라 이식하면 된다)
