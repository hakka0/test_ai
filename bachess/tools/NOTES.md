# 작업 메모 (컨텍스트 보존용)

## 레퍼런스 (블루 아카이브 UI 이미지 검색 결과, /home/ubuntu/upload/search_images/)
- tzrY4iscSnDR.png (Fandom Wiki Affection): 로비. 좌상단 네이비 사선 Lv 배너(노란 경험치 바), 상단 흰색 사선 자원 pill(녹색 AP 번개/금색 크레딧 카드/청휘석 보석 + 파란 + 버튼), 우상단 흰 아이콘 버튼, 하단 반투명 흰 네비게이션 바(아이콘+라벨), 우하단 파란 폴더형 버튼, 노란/주황 이벤트 배너.
- SEOw6O9REJ2A.webp (bluearchive.gg Shop Guide) / 0HZ6XdbM2zNd.jpg (상점 팁): 좌측 세로 탭(활성=네이비 사선+노란 이탤릭 글씨, 비활성=흰색), 우측 회색-청 카드 그리드(좌상단 체크박스, 아이템 아이콘, x수량, 하단 파란 '구매하기' 사선 버튼+금색 재화 칩), 하단 흰 둥근 바 '갱신까지 N시간' + '즉시 갱신' 버튼, 좌상단 파란 원형 뒤로가기, 우상단 톱니/홈.
- Y1uv5cijh5MB.png (시논의 배틀패스): 노란 그라데이션 라운드 카드(잠금 아이콘), 하늘색 카드, 네이비 'NOW' 행, 노란 CTA 버튼(엄지 아이콘), 파란 '미션' 버튼, 이탤릭 굵은 타이틀 'SEASON 3'.
- 색상: 네이비 #1b3560, 하늘 #dff0ff, 시안 #2eb7ff, 블루 #2c8df0, 노랑 #ffd53d, 잉크 #2a3f63

## 구현 진행 (프로젝트: /home/ubuntu/bachess, 정적 사이트 public/ → build outputDirectory=public)
- 완료: public/js/data.js, sim.js, sprites.js, fx.js, audio.js, state.js, index.html, css/style.css, tools/balance.mjs(밸런스 테스트)
- 남음: js/ui.js(렌더/드래그/툴팁/모달), js/main.js(루프/스케일/단축키), dev server 선언(python http.server 3000 --directory public), 스크린샷 검증, git push(체크포인트), 3가지 예시 정리
- 밸런스: HPK=2.6, ATKK=1.5, ROUND_MULT 조정 완료

## PVP 확장 진행 (2026-11-22)
- 완료: sim.js(buildTeamBattlers, simulateMatch), bots.js(봇 AI/매치메이킹/순위), state.js(PVP 흐름: tick/toggleReady/beginMatching/applyDue/finishPvp/ranking), index.html(lbPanel/matchOv/PVE 비활성 버튼), style.css(PVP 섹션)
- 남음: ui.js(순위표/타이머/매칭 오버레이/결과/엔드/도움말), main.js(tick 연동, 준비 토글), 테스트, 푸시

