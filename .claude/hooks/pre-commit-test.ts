// PreToolUse(Bash) 훅: `git commit` 실행 전에 테스트를 돌리고, 하나라도 실패하면 커밋을 차단한다.
const input = JSON.parse(await Bun.stdin.text());
const command: string = input?.tool_input?.command ?? "";

const GIT_COMMIT = /(?:^|[;&|]\s*)git\s+(?:-C\s+\S+\s+|-\S+\s+)*commit\b/;
if (!GIT_COMMIT.test(command)) process.exit(0);

const result = Bun.spawnSync(["bun", "run", "test"], {
  cwd: input?.cwd ?? process.cwd(),
  stdout: "pipe",
  stderr: "pipe",
});

if (result.exitCode === 0) process.exit(0);

const output = `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-40).join("\n");
console.error(`테스트가 실패해 커밋을 차단했습니다. 테스트를 고친 뒤 다시 커밋하세요.\n\n${output}`);
process.exit(2);
