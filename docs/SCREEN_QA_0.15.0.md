# 0.15.0 화면 검증

Linux headless Chromium 138.0.7204.0 / Playwright 1.62.1에서 실제 게임을 실행했습니다. PC는 Windows UA, 모바일은 Android UA·터치 입력을 사용했습니다. 실제 휴대폰·Windows/macOS·Safari·Firefox 직접 검사는 포함하지 않습니다.

- `npm run build` 통과, `npm test` 167개 통과.
- `npm run test:mobile-dock:browser` 통과: 세로/가로/태블릿 7가지 화면 크기, 대기석·상점 동시 표시, 고정 위치/겹침/가로 넘침/실제 클릭 대상과 44px 터치 크기, 12칸 좌우 이동, 양방향 드래그 교환과 취소/회전, 드래그 중 창 높이 유지, 선택 해제/상세/장비, 경험치/구매/리롤과 전투 제한, 기록/기여도/보상/눈 버튼, 재접속/모드 선택/로비, 합성/판매 확인/키보드 조작을 확인합니다. `test:browser`도 같은 모바일 검사를 실행합니다.
- `npm run test:pc-dock:browser` 통과: 기존 PC 5가지 창 크기, 전장/고정 창 겹침 방지, 마우스 교환과 접기, 상세/장비/기록, 전투 중 상점, 보상, 모드 변경, 최종 결과/재시작/로비를 확인합니다.
- 화면 모드·보상·모바일 교환·기록/기여도·최종 결과 검사 통과. UA 기본값, 수동 선택/재실행/자동 복원, 상품 구매와 보상/제작, 기록 기억/스테이지 이동, 결과 창 안전한 이름 표시와 재시작을 확인합니다.
- `npm run test:visual:browser` 통과: PC/모바일 6가지 기본 화면과 모드 선택/기록/기여도/보상/눈 버튼/최종 결과 11장 캡처. 페이지 JavaScript 오류와 가로 넘침이 없음을 확인합니다.
- server/shared 21개 파일은 0.14.0 ZIP과 바이트 단위로 동일합니다.

모바일 설명/화면 크기/캡처는 [MOBILE_LAYOUT.md](MOBILE_LAYOUT.md), 원본 측정은 [모바일 JSON](screenshots/mobile-dock/metrics.json)입니다. PC 설명은 [PC_LAYOUT.md](PC_LAYOUT.md), 새 PC 측정은 [PC JSON](screenshots/pc-dock/pc-metrics.json)입니다. 0.14.0 검사·캡처는 `SCREEN_QA_0.14.0.md` / `screenshots/verified-0.14.0` / `screenshots/pc-dock-0.14.0`에 보존했습니다.

## 재실행

```sh
npm ci
npm run build
npm run setup:browser
npm run test:mobile-dock:browser
npm run test:pc-dock:browser
npm run test:screen-mode:browser
npm run test:rewards:browser
npm run test:swap:browser
npm run test:history:browser
npm run test:results:browser
npm run test:visual:browser
npm test
```

Chromium 설치 방식과 `CHROME_PATH` 지정은 [0.13.3 도구 설명](SCREEN_QA_0.13.3.md)을 참고하세요. 브라우저 도구는 게임 실행에 필요 없으며 바이너리는 ZIP에 포함하지 않습니다. 모바일 검사 서버 포트는 2601, PC 검사는 2596입니다.
