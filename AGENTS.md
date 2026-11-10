# AGENTS.md

## Operational Commands

- 패키지 매니저는 `bun` 고정. 서버가 `bun --watch run server/index.ts`로 실행된다 (`package.json` scripts.server).
- 설치: `bun install`
- 개발 (API 서버 3002 + Vite 5173 동시 실행): `bun run dev`
- 서버만 실행: `bun run server`
- 테스트: `bun run test` (= `vitest run`), 감시 모드는 `bun run test:watch`
- 린트: `bun run lint`
- 빌드/타입체크: `bun run build` (`tsc -b && vite build`)
- 변경 후 완료 보고 전에 `bun run lint`, `bun run test`, `bun run build`를 실행한다.

## Golden Rules

### Immutable

- API 키(`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`)는 서버에서만 읽는다 (`server/index.ts:59-62`). 클라이언트로 키 값을 내려보내지 않는다. `/api/config`는 불리언만 반환한다 (`server/index.ts:147-153`). 이 형태를 유지한다.
- `.env`는 커밋하지 않는다 (`.gitignore`). 새 환경변수는 `.env.example`에 빈 값으로만 추가한다.
- 민감 파일(`.env`, `.env.*`(`.env.example` 제외), `*.pem`, `*.key`, `id_rsa*`, `*credential*`, `*secret*`, `.npmrc`, `.netrc`, `.aws/`, `.ssh/`)은 읽지도 수정하지도 않는다. `.claude/settings.json`의 `permissions.deny`가 Read/Edit/Bash로 차단하며, 이 규칙을 우회하는 스크립트(`node -e`, 셸 리다이렉션 등)로 접근하는 것도 금지한다. deny 목록을 바꾸면 이 항목도 함께 갱신한다.

### Do

- 테스트 러너는 vitest다. `bun test`(Bun 내장 러너)를 쓰지 않는다. `vite.config.ts:15-20`의 jsdom 환경과 setup 파일이 적용되지 않는다.
- AI 응답 후처리 로직은 `server/generator.ts`의 순수 함수에 둔다. `server/index.ts`는 `Bun.serve`를 모듈 최상위에서 실행하므로 import하는 순간 서버가 뜬다 (`server/index.ts:138`). 테스트 대상 로직을 index.ts에 넣지 않는다.
- 생성 코드는 react-live `noInline` 모드로 실행된다 (`src/components/LivePreview.tsx:14`). 이 모드는 `render(<X />)` 호출이 있어야 그려진다. 렌더 경로를 바꿀 때 `ensureRenderCall`(`server/generator.ts:16`)과 함께 검토한다.
- 새 서버 로직에는 `server/*.test.ts`, 새 컴포넌트 로직에는 `src/**/*.test.tsx`를 추가한다. 테스트 include 범위는 `vite.config.ts:19`다.

### Don't

- 서버 포트 3002를 한쪽만 바꾸지 않는다. `server/index.ts:139`와 `vite.config.ts:11`의 프록시 대상 두 곳이 함께 바뀌어야 한다.
- 시스템 프롬프트(`server/index.ts:7-49`)에서 "import 금지", "TypeScript 문법 금지", "render() 호출", "코드펜스 금지" 규칙을 제거하지 않는다. react-live는 import와 TS 문법을 실행하지 못한다. 같은 위험을 후처리(`stripCodeFences`, `ensureRenderCall`)에서도 막는 이중 방어 구조이므로 한쪽만 지우면 모델 응답이 흔들릴 때 미리보기가 깨진다.
- 에러 매핑은 메시지 문자열에 `503`/`429`가 포함되는지로 분기한다 (`server/index.ts:194,201`). provider 호출부의 에러 메시지에 `API error: ${status}` 형식을 유지한다 (`server/index.ts:85,112`).

### 비대칭 주의

- Google 경로에만 모델 폴백(`withModelFallback`)과 `MAX_TOKENS` 절단 검사가 있다 (`server/index.ts:123,135`). Anthropic 경로(`server/index.ts:68-96`)에는 없다. 한 provider의 처리를 고칠 때 다른 쪽에 같은 문제가 있는지 확인한다.

### 테스트 경계

- 테스트 있음: `server/generator.ts`, `server/fallback.ts`, `src/components/PromptInput.tsx`.
- 테스트 없음: `server/index.ts`(HTTP 핸들러, provider 호출), `src/App.tsx`, `src/hooks/useComponentGenerator.ts`, `src/components/{CodeView,ComponentCard,LivePreview}.tsx`. 이 영역을 수정하면 수동 확인(`bun run dev`)을 하거나 테스트를 함께 추가한다.

## Project Context

- AI provider(Claude/Gemini)로 React 컴포넌트를 생성하고 react-live로 미리보기하는 도구.
- Stack: React 19, TypeScript, Vite, Bun(API 프록시), vitest, react-live, ESLint.
- 설치/실행 설명은 `README.md`를 따른다.

## Context Map

- **[서버 수정 (Bun API)](./server/AGENTS.md)** — 엔드포인트, provider 호출, 응답 정규화 작업 시.
- **[프론트엔드 수정 (React/Vite)](./src/AGENTS.md)** — 컴포넌트, 훅, 스타일, 프론트 테스트 작업 시.

## Standards & References

- 커밋: `<type>: <한국어 요약>` (type: feat, fix, refactor, chore). 본문은 이유가 드러나지 않을 때만 작성. push는 사용자가 요청할 때만 한다.
- Maintenance Policy: 이 문서의 규칙과 실제 코드가 어긋나면 작업을 멈추고 AGENTS.md 업데이트를 제안한다.
