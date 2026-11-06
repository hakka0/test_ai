# 0.14.0 화면 검증

Linux headless Chromium 138.0.7204.0 / Playwright 1.62.1에서 실제 게임을 실행했습니다. PC는 Windows UA, 모바일은 Android UA·터치 입력을 사용했습니다. 실제 휴대폰·Windows/macOS·Safari·Firefox 직접 검사는 포함하지 않습니다.

- `npm run build` 통과, `npm test` 167개 통과.
- PC 새 배치 검사 `npm run test:pc-dock:browser` 통과. PC 5가지 창 크기, 전장과 하단 창의 겹침 방지, 고정 위치, 클릭 가능한 대상, 드래그 교환·접기·유닛 상세/장비·기록·전투 중 상점·보상·모드 복원·최종 결과 연결을 확인합니다.
- 기존 브라우저 검사 6종 통과: 화면 모드, 보상, 모바일 조작, 모바일 교환, 기록/기여도, 최종 결과.
- `npm run test:visual:browser` 통과: PC/모바일 6가지 기본 화면과 기록·기여도/보상/눈 버튼/최종 결과/모드 선택 캡처. 페이지 JavaScript 오류와 수평 넘침이 없음을 확인했습니다.

PC 측정·새 캡처는 [PC_LAYOUT.md](PC_LAYOUT.md), 측정 JSON은 [pc-metrics.json](screenshots/pc-dock-0.14.0/pc-metrics.json)입니다. 기본 화면 캡처는 `screenshots/verified-0.14.0`, PC 기능 캡처는 `screenshots/pc-dock-0.14.0`에 있습니다. [0.13.3 검사 기록](SCREEN_QA_0.13.3.md)과 당시 캡처는 별도로 보존했습니다.

## 재실행

```sh
npm ci
npm run build
npm run setup:browser
npm run test:pc-dock:browser
npm run test:screen-mode:browser
npm run test:rewards:browser
npm run test:browser
npm run test:swap:browser
npm run test:history:browser
npm run test:results:browser
npm run test:visual:browser
```

Chromium 설치 방식과 `CHROME_PATH` 지정은 [0.13.3 도구 설명](SCREEN_QA_0.13.3.md)을 참고하세요. 브라우저 도구는 게임 실행에 필요 없으며 바이너리는 ZIP에 포함하지 않습니다. PC 새 배치 검사 포트는 2596입니다.
