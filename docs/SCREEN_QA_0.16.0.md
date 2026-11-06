# 0.16.0 화면 검증

Linux headless Chromium 138.0.7204.0 / Playwright 1.62.1에서 실행했습니다. PC는 Windows UA, 모바일은 Android UA·터치 입력을 지정했습니다. 실제 Windows/macOS/휴대폰/Safari/Firefox 직접 검사는 포함하지 않습니다.

- TypeScript/Vite 빌드 통과. 기존 규칙·입력 테스트 **167개** 통과.
- 공통 하단 창 검사: PC 6가지 크기(1440×1000, 1920×1080, 1366×768, 1024×768, 844×390, 390×844), 모바일 7가지 크기(390×844, 320×740, 360×640, 414×896, 768×1024, 844×390, 480×320)에서 세 탭을 각각 확인합니다. 측정 총 39개.
- 탭 하나만 표시, 선택 유닛 정보/착용 장비가 고정 창 밖에 있음, 고정 위치와 페이지 스크롤, 전장/고정 창 겹침 방지, 가로 넘침 없음, 주요 터치 영역 최소 44px, 모바일 대기석 끝 칸 접근을 검사합니다.
- 키보드 좌우/Home/End 전환, 내용 접기와 탭으로 펼치기, 드래그 중 전장/고정 창 크기 유지, PC 마우스와 모바일 터치 양방향 교환/대기석 교환/터치 취소, 유닛 상세와 장비 장착, 보관 아이템 수/팝업/Escape/관리 연결을 검사합니다.
- 새로고침과 화면 모드 변경 후 탭 유지, 경험치 구매/상점 구매/리롤, 전투 중 구매·리롤 허용과 배치·경험치 제한, 기록/기여도, 보상 팝업과 눈 버튼, 로비에서 조작 차단을 검사합니다.
- 기존 화면 모드·보상/제작·모바일 교환·기록/기여도·최종 결과 브라우저 검사를 통과했습니다. 최종 결과 닫기/다시 열기, 기록 연결, 재시작과 새 세션을 확인합니다.
- 기본 화면/모드 선택/기록·기여도/보상·눈 버튼/최종 결과 스크린샷 검사도 통과했습니다. 6가지 기본 화면과 추가 상태를 캡처했으며 가로 넘침과 페이지 JavaScript 오류가 없었습니다.
- server/shared 21개 파일은 0.15.0 원본과 바이트 단위로 동일합니다.

원본 결과는 [고정 창 측정 JSON](screenshots/dock-tabs/metrics.json), 기능·스크린샷은 [DOCK_TABS.md](DOCK_TABS.md)에 있습니다. 0.15.0 설명은 `SCREEN_QA_0.15.0.md`, 기본 화면 캡처는 `screenshots/verified-0.15.0`에 보존했습니다. 아주 낮은 가로 창은 내부 스크롤/접기가 필요합니다.

## 재실행

```sh
npm ci
npm run build
npm run setup:browser
npm run test:dock-tabs:browser
npm run test:screen-mode:browser
npm run test:rewards:browser
npm run test:swap:browser
npm run test:history:browser
npm run test:results:browser
npm run test:visual:browser
npm test
```

`test:pc-dock:browser`와 `test:mobile-dock:browser`는 공통 검사의 해당 모드만 실행합니다. `test:browser`는 모바일 검사를 실행합니다. 공통 검사 서버 포트는 2612입니다. 병렬로 두 개의 공통 검사 명령을 실행하지 마세요. 도구 설치와 `CHROME_PATH` 지정은 [SCREEN_QA_0.13.3.md](SCREEN_QA_0.13.3.md)를 참고하세요. 게임 실행에는 브라우저 도구가 필요하지 않습니다.

실행은 `npm ci` → `npm start`입니다. `npm start`는 현재 소스를 먼저 빌드합니다. 개발 서버는 `npm run dev`로 실행합니다. 화면 모드 선택 줄에 실제 빌드 버전 v0.16.0이 표시되는지 확인하세요.
