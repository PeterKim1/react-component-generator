# server/AGENTS.md

## Module Context

Bun 런타임에서 실행되는 AI API 프록시. 프론트엔드는 Vite 프록시를 통해 `/api/*`로 호출한다 (`vite.config.ts:9-14`).

## Tech Stack & Constraints

- 런타임은 Bun (`Bun.serve`, `process.env`). 외부 HTTP 라이브러리 없이 전역 `fetch`만 사용한다 (`index.ts:69,101`).
- Node 전용 `http`/`express` 등 서버 프레임워크를 추가하지 않는다.
- Google 모델 우선순위는 `GOOGLE_MODELS` 배열 순서가 곧 폴백 순서다 (`index.ts:5`).

## Implementation Patterns

- 라우팅은 `fetch(req)` 안의 `method` + `url.pathname` 분기다 (`index.ts:141-213`). 새 엔드포인트도 같은 패턴으로 추가한다.
- 모든 응답에 `CORS_HEADERS`를 붙인다 (`index.ts:51`). 새 `Response.json`에서 헤더를 빠뜨리지 않는다. 에러 응답도 포함한다.
- 새 provider는 `Provider` 타입(`index.ts:57`), `ENV_KEYS`(`index.ts:59`), 호출 함수, 분기(`index.ts:183-186`)를 함께 수정한다. 클라이언트 `src/types/index.ts`의 `Provider`와 일치시킨다.
- 응답 정규화는 `generator.ts`, 재시도/폴백 흐름은 `fallback.ts`에 순수 함수로 둔다.

## Testing Strategy

- 실행: `bun run test` (vitest, 루트에서). 파일 위치는 대상 옆 `*.test.ts`.
- 테스트는 jsdom 환경에서 돈다 (`vite.config.ts:16`). `generator.ts`, `fallback.ts`에는 `Bun` 전역을 쓰지 않아 테스트가 가능하다. 이 두 파일에 Bun 전용 API를 넣지 않는다.
- `index.ts`는 import 시 서버가 시작되므로 테스트에서 import하지 않는다.

## Local Golden Rules

- Do: Google URL의 `key` 쿼리(`index.ts:99`)가 로그나 에러 메시지에 노출되지 않게 한다. 현재 에러는 상태 코드만 포함한다 (`index.ts:112`). 요청 URL을 에러에 넣지 않는다.
- Do: Google `MAX_TOKENS` 절단은 에러로 처리한다 (`index.ts:123`). 잘린 코드를 정상 응답으로 돌려보내지 않는다.
- Do: `withModelFallback`은 모두 실패하면 마지막 에러를 던진다 (`fallback.ts:19`). 호출부는 이 에러를 그대로 상태 코드 매핑(`index.ts:194-206`)에 넘긴다.
- Don't: 서버 응답으로 `ENV_KEYS` 값을 반환하지 않는다 (`index.ts:150-153`은 `!!`로 불리언 변환).
- Don't: `Access-Control-Allow-Origin: *`(`index.ts:52`)를 유지한 채 인증이 필요한 엔드포인트나 서버 저장 키를 사용하는 기능을 추가하지 않는다. 와일드카드 CORS와 서버 보관 키 조합은 누구나 키를 소비할 수 있게 만든다.
