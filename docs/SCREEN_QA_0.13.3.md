# 0.13.3 화면 검증

검증 일자: 2026-10-01. Linux x64, Node 24.19.0, Playwright 1.62.1, headless Chromium 138.0.7204.0. PC는 Windows User-Agent, 모바일은 Android User-Agent를 지정했습니다. 터치 동작은 Playwright 입력으로 검사했습니다. 실제 Windows/macOS·휴대폰·Safari·Firefox에서 직접 검사한 결과는 아닙니다.

게임 client/server/shared 소스는 0.13.2 그대로입니다. Chromium 설치와 검사 도구만 정리했으며 원래 PC 배치와 스크롤 방식은 유지했습니다.

## 실행 방법

Node 22 이상과 npm이 필요합니다. 먼저 게임을 설치·빌드하고 브라우저를 준비합니다.

```sh
npm ci
npm run build
npm run setup:browser
npm run test:screen-mode:browser
npm run test:rewards:browser
npm run test:browser
npm run test:swap:browser
npm run test:history:browser
npm run test:results:browser
npm run test:visual:browser
```

설치는 Playwright를 `.browser-tools`에 분리합니다. Linux x64에서는 이 환경에서 실행을 확인한 `@sparticuz/chromium@138.0.2`의 Chromium·SwiftShader 파일을 `.browser-runtime`에 소유권 복원 없이 압축 해제합니다. 설치 후 실제 실행·페이지 표시도 검사합니다. Windows/macOS 등 다른 환경에서는 Playwright의 공식 Chromium 설치를 사용하도록 구성했으나 이 작업에서는 해당 환경의 설치를 검증하지 않았습니다. npm과 브라우저 다운로드를 위한 네트워크가 필요합니다.

기존 브라우저를 사용하려면 `CHROME_PATH`에 실행 파일 절대 경로를 지정하세요. 우선순위는 지정 경로 → 프로젝트 Chromium → Playwright 기본 Chromium입니다. 두 도구 폴더는 ZIP/게임 의존성에 포함하지 않으며 `npm start`에는 브라우저 도구 설치가 필요 없습니다. 검사 브라우저의 `--no-sandbox`는 컨테이너용 자동 검사 설정입니다.

각 검사는 빌드된 게임을 임시 서버에서 실행합니다. 사용 포트는 보상 2582, 교환 2585, 모바일 조작 2588, 기록 2590, 최종 결과 2595, 모드 2597, 캡처 2598입니다. 같은 검사를 중복 실행하거나 해당 포트를 다른 프로그램과 함께 사용하지 마세요. 화면 글꼴 확인에는 환경의 Noto Sans CJK KR을 사용했으며 게임 글꼴 설정은 바꾸지 않았습니다.

## 실제 렌더 측정

| 화면/캡처 | 창 크기 | 모드 | 전장 폭·높이 | 조작 바 위치 | 수평 넘침 |
|---|---|---|---|---|---|
| [PC 넓은 창](screenshots/verified-0.13.3/pc-wide.png) | 1440×1000 | pc | 560px | static | 없음 |
| [PC 짧은 창](screenshots/verified-0.13.3/pc-short.png) | 844×390 | pc | 496px | static | 없음 |
| [PC 좁은 세로 창](screenshots/verified-0.13.3/pc-portrait.png) | 390×844 | pc | 364px | static | 없음 |
| [모바일 세로](screenshots/verified-0.13.3/mobile-portrait.png) | 390×844 | mobile | 364px | fixed | 없음 |
| [모바일 짧은 가로](screenshots/verified-0.13.3/mobile-short.png) | 844×390 | mobile | 300px | static | 없음 |
| [모바일 작은 세로](screenshots/verified-0.13.3/mobile-small.png) | 320×740 | mobile | 302px | fixed | 없음 |

여섯 화면에서 전장 캔버스·유닛 그림·한글을 확인했고, 전장 폭·높이가 같고 수평 넘침이 없음을 측정했습니다. PC 짧은 창의 496px와 모바일 짧은 창의 300px가 구분됩니다. PC 세로에서는 고정 조작 바가 적용되지 않습니다. 기존 스크롤 배치를 유지하므로 짧은 창에서 전장·대기석 전체가 동시에 보이는 것은 목표가 아닙니다. 원본은 [metrics.json](screenshots/verified-0.13.3/metrics.json)이며 캡처 중 페이지 JavaScript 오류는 없었습니다.

## 추가 화면 확인

- [하단 화면 선택](screenshots/verified-0.13.3/mode-footer.png): 본문 맨 아래 버튼, 현재 모드 강조, 자동 복원 상태.
- [전투 기록과 기여도](screenshots/verified-0.13.3/history-contributions.png): 스테이지 진행표, 상대·승패·체력 감소, 양측 유닛 기여도.
- [라운드 보상](screenshots/verified-0.13.3/reward-popup.png): 전장 위 선택 팝업, 세 후보와 오른쪽 아래 눈 버튼.
- [눈 버튼을 누르는 동안](screenshots/verified-0.13.3/reward-peek.png): 본문과 배경 투명, 눈 버튼 유지, 전장 조회.
- [최종 결과](screenshots/verified-0.13.3/final-results.png): 결과 요약, 기록·재시작·로비 버튼.

11장은 뷰포트 캡처이며 모두 시각적으로 확인했습니다. 자동 재촬영은 `npm run test:visual:browser`로 할 수 있습니다.

## 자동 검사 결과

| 검사 | 결과 | 주요 확인 |
|---|---|---|
| 화면 모드 | 통과 | UA 기본값, 선택·저장·새로고침, 크기 변경 시 모드 유지, PC 축소 방지, 자동 복원 |
| 라운드 보상 | 통과 | 팝업, 마우스/터치/키보드 눈 버튼, 크기 변경 시 복원, 선택·제작·자동 지급·재접속 |
| 모바일 조작 | 통과 | 선택·배치·상세·장비, 드래그 취소/회전, 판매 확인/취소, 합성·키보드·재접속 |
| 자리 교환 | 통과 | 전장↔대기석 양방향·대기석끼리, 드롭 강조, 재접속, 전투 중 배치 제한 |
| 전투 기록 | 통과 | 기본 접힘, 숨긴 상태 누적, 상세 닫기/기억/재접속, 스테이지 이동, 기여도 |
| 최종 결과 | 통과 | 표시·닫기·재열기, 닉네임 안전 표시, 기록 조회, 여러 화면 크기, 재시작·로비 |
| 화면 캡처 | 통과 | 6가지 기본 화면+5가지 기능 화면, 수평 넘침·실행 오류·전장 크기 검사 |
| 빌드·규칙/입력 | 통과 | TypeScript/Vite 및 167개 검사, 실패 0 |

현재 단계 문구, 접힌 디버깅 패널, 숨겨진 드래그 그림 대기 조건과 고정 조작 바에 가려진 테스트 좌표를 검사 코드에서 바로잡았습니다. 게임 로직 수정은 없습니다. 이전 버전별 기록은 [VALIDATION.md](VALIDATION.md)에 있습니다.
