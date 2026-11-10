# src/AGENTS.md

## Module Context

Vite로 번들되는 React 19 프론트엔드. 서버(`../server`)와는 `/api/*` HTTP로만 통신하며 코드를 직접 import하지 않는다.

## Tech Stack & Constraints

- 스타일은 일반 CSS(`App.css`, `index.css`)와 `win`, `win-title` 같은 공용 클래스를 쓴다 (`App.tsx:50-80`, `ComponentCard.tsx:24-28`). CSS-in-JS나 유틸리티 CSS 프레임워크를 추가하지 않는다.
- 상태 관리 라이브러리 없이 `useState`와 커스텀 훅만 쓴다 (`hooks/useComponentGenerator.ts`).
- UI 문구는 한국어다 (`PromptInput.tsx:34,57`, `App.tsx:75`). 새 문구도 한국어로 쓴다.
- TypeScript 설정이 엄격하다 (`../tsconfig.app.json`): `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`.

## Implementation Patterns

- 컴포넌트는 `components/PascalCase.tsx`에 named export로 만든다 (`export function ComponentCard`). `App`만 default export다 (`App.tsx:200`).
- props 타입은 같은 파일 상단의 `interface XxxProps`로 정의한다 (`CodeView.tsx:3`).
- 서버 호출과 비동기 상태(loading, error)는 컴포넌트가 아니라 훅에 둔다 (`useComponentGenerator.ts:13-60`).
- 공용 타입은 `types/index.ts`에 둔다.
- 테스트는 대상 옆 `*.test.tsx`에 둔다.

## Testing Strategy

- 실행: `bun run test` (루트). 환경은 jsdom이며 `test/setup.ts`가 jest-dom 매처를 등록한다.
- `afterEach(cleanup)`은 이미 `test/setup.ts:6`에 있다. 각 테스트 파일에서 중복 선언하지 않는다.
- 패턴은 `PromptInput.test.tsx`를 따른다: `userEvent.setup()`으로 입력하고, `getByRole`에 버튼의 한국어 이름을 넣어 찾는다. 테스트 이름은 한국어 문장이다.
- 훅 테스트에서는 `fetch`를 모킹한다. 실제 서버를 호출하지 않는다.

## Local Golden Rules

- Do: 타입만 가져올 때는 `import type`을 쓴다 (`useComponentGenerator.ts:2`, `ComponentCard.tsx:2`). `verbatimModuleSyntax` 때문에 일반 import는 빌드 에러가 난다.
- Do: `enum`, 생성자 매개변수 프로퍼티, `namespace`를 쓰지 않는다. `erasableSyntaxOnly`가 막는다. 문자열 유니온을 쓴다 (`types/index.ts:1`).
- Do: 서버 호출은 상대 경로 `/api/...`로 한다 (`useComponentGenerator.ts:23`, `App.tsx:25`). Vite 프록시(`../vite.config.ts:9-14`)에 의존하므로 `http://localhost:3002`를 하드코딩하지 않는다.
- Do: 미리보기 새로고침은 `LivePreview`의 `key`를 바꿔 리마운트하는 방식이다 (`ComponentCard.tsx:17,75`). 애니메이션 컴포넌트를 처음부터 다시 재생하기 위한 구조이므로 상태 리셋 로직으로 바꾸지 않는다.
- Do: `Provider` 타입(`types/index.ts:1`)은 서버의 `Provider`(`../server/index.ts:57`)와 별도로 선언돼 있다. 값을 추가하면 양쪽과 `App.tsx`의 `PROVIDER_CONFIG`(`App.tsx:8`)를 함께 수정한다.
- Don't: 사용자가 입력한 API 키를 `localStorage` 등에 저장하지 않는다. 키는 `useState`에만 있고 provider를 바꾸면 비워진다 (`App.tsx:14,43`).
- Don't: `LiveProvider`의 `scope`에 `apiKey`나 앱 내부 값을 넣지 않는다. 현재 `LivePreview`는 `code`만 받는다 (`LivePreview.tsx:4,14`). AI가 생성한 코드가 같은 origin에서 실행되므로 노출한 값은 생성 코드가 읽을 수 있다.
- Don't: `handleGenerate`(`App.tsx:33`)의 API 키 사전 검사를 제거하지 않는다. 재생성도 같은 함수를 거친다 (`App.tsx:184`). 재생성은 원래 provider가 아니라 현재 선택된 provider와 키로 호출된다.
