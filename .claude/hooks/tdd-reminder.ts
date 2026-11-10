// PreToolUse(Edit|Write) 훅: 코드 파일을 만들거나 고치기 전에 tdd.md 규칙을 상기시키는 컨텍스트를 주입한다.
const input = JSON.parse(await Bun.stdin.text());
const filePath: string = (input?.tool_input?.file_path ?? "").replaceAll("\\", "/");

const isCode = /\.(ts|tsx|js|jsx)$/.test(filePath);
const isTest = /\.test\.(ts|tsx|js|jsx)$/.test(filePath);
const isOutOfScope = /(^|\/)(\.claude|node_modules|dist)\//.test(filePath) || /\.config\.(ts|js)$/.test(filePath);
if (!isCode || isTest || isOutOfScope) process.exit(0);

const reminder = `[TDD 규칙 상기 - .claude/rules/tdd.md, Rigid]
지금 ${filePath} 를 수정하려 합니다. 진행 전에 다음을 확인하세요.
1. 이 동작을 검증하는 테스트를 이미 작성했고, 실행해서 "기능 미구현" 사유로 실패(RED)하는 것을 확인했는가?
2. 아직 아니라면 이 수정을 멈추고 테스트부터 작성한다. 버그 수정도 재현하는 실패 테스트가 먼저다.
3. 테스트보다 프로덕션 코드를 먼저 썼다면 그 코드를 삭제하고 RED부터 다시 시작한다. 주석 처리나 "참고용" 보관도 금지다.
4. GREEN은 테스트를 통과시키는 최소한의 코드만 쓴다(YAGNI). 하나의 동작은 하나의 테스트다.
5. REFACTOR에서는 새 동작을 추가하지 않고, 변경마다 테스트를 실행한다.
"나중에 테스트 추가", "너무 단순함", "시간 없음"은 변명이다. 순수 UI/타입/설정만 TDD 예외이며, 애매하면 적용 대상이다.`;

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: reminder,
    },
  }),
);
