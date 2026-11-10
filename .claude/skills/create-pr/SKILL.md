---
name: create-pr
description: 현재 브랜치의 변경사항을 분석해 references/ 아래 한국어·영어 템플릿 중 하나에 맞춰 Pull Request를 생성한다. "PR 만들어줘", "풀리퀘스트 생성", "PR 올려줘", "create pr", "영어로 PR 만들어줘" 같은 요청에 활성화한다.
context: fork
allowed-tools: Read Glob Grep Bash
---

# Create PR

현재 브랜치와 base 브랜치의 차이를 분석해 `references/`의 템플릿 양식으로 PR 본문을 작성하고 `gh pr create`로 생성한다.

## 템플릿

| 언어 | 파일 |
| --- | --- |
| 한국어 (기본) | `references/pr-template.ko.md` |
| 영어 | `references/pr-template.en.md` |

**언어 선택 규칙**

- 사용자가 "영어로", "in English", `en` 등으로 영어를 요청하면 영어 템플릿을 쓴다.
- "한국어로", `ko`를 요청하거나 언어 지정이 없으면 한국어 템플릿을 쓴다.
- 요청 문장의 언어는 판단 근거로 쓰지 않는다. 명시적으로 지정했을 때만 영어를 쓴다.
- 선택한 언어가 PR 제목, 본문, 최종 보고 언어를 모두 결정한다.

## 절차

### 1. 사전 확인

아래를 실행해 PR을 만들 수 있는 상태인지 확인한다. 서로 독립적이므로 한 번에 병렬로 실행한다.

- `git branch --show-current` — 현재 브랜치
- `git status --short` — 커밋되지 않은 변경
- `gh auth status` — GitHub CLI 로그인 여부
- `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` — base 브랜치

다음 경우에는 PR을 만들지 않고 이유를 알린 뒤 끝낸다.

- 현재 브랜치가 base 브랜치와 같다. (base에서 직접 PR을 만들 수 없다. 작업 브랜치를 만들어 달라고 안내한다.)
- `gh`가 로그인되어 있지 않다.
- base 브랜치와 비교해 커밋 차이가 없다.
- 같은 브랜치의 열린 PR이 이미 있다. (`gh pr list --head <브랜치> --state open`) 기존 PR URL을 알려 준다.

커밋되지 않은 변경이 있으면 PR에 포함되지 않는다는 점을 최종 보고에 적는다. 임의로 커밋하지 않는다.

### 2. 변경사항 분석

- `git log <base>..HEAD --oneline` — PR에 담길 커밋 목록
- `git diff <base>...HEAD --stat` — 변경 파일 윤곽
- 필요한 파일만 `git diff <base>...HEAD -- <파일>` 또는 Read로 자세히 읽는다.

원격에 base 브랜치 최신 상태가 없으면 `git fetch origin <base>`를 먼저 실행한다.

### 3. 템플릿 읽기

위 규칙으로 고른 템플릿 하나만 Read로 읽는다. 이 스킬 디렉토리 기준 상대 경로다.

- 템플릿의 섹션 구조와 순서를 그대로 유지한다. 섹션을 임의로 추가·삭제하지 않는다.
- 각 섹션의 안내 주석(`<!-- -->`)은 지시로 읽고, 최종 본문에서는 제거한다.
- 해당 없는 섹션은 지우지 말고 한국어는 `해당 없음`, 영어는 `N/A`라고 쓴다.

### 4. 제목과 본문 작성

**제목**

- 선택한 언어로 작성, 70자 이내, 마침표 없음.
- 커밋이 하나뿐이면 그 커밋 메시지를 따른다. 여러 개면 전체를 아우르는 `<type>: <요약>` 형식으로 쓴다. (type: feat, fix, refactor, chore)
- 영어 PR이면 type 뒤 요약을 영어로 쓴다. 예: `feat: add 500-character prompt validation`

**본문**

- 커밋 메시지를 나열하지 말고 diff를 읽고 이해한 내용으로 쓴다. "무엇이 달라졌는지"와 "왜"를 적는다.
- 확인하지 않은 내용을 쓰지 않는다. 테스트 결과는 실제로 실행해서 확인한 것만 체크한다. 실행하지 않았으면 체크하지 않고 이유를 적는다.
- 코드 식별자, 파일명, 라이브러리 이름은 원문 그대로 쓴다.
- 마지막 줄에 아래 문구를 붙인다.

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 5. 푸시와 PR 생성

1. 현재 브랜치가 원격에 없거나 뒤처져 있으면 `git push -u origin <브랜치>`로 푸시한다. 강제 푸시(`--force`)는 쓰지 않는다.
2. 본문을 임시 파일이 아니라 heredoc으로 `--body-file -`에 전달한다.

```bash
gh pr create --base <base> --title "<제목>" --body-file - <<'EOF'
<본문>
EOF
```

3. 사용자가 draft를 요청했거나 변경이 미완성이면 `--draft`를 붙인다.

### 6. 결과 보고

생성된 PR의 URL, 제목, base와 head 브랜치, 포함된 커밋 수를 선택한 언어로 보고한다. 커밋되지 않은 변경이 있었다면 함께 알린다.

## 주의

- base 브랜치(`main` 등)로의 직접 푸시는 하지 않는다.
- `--force`, `--no-verify`, 기존 PR 본문 덮어쓰기는 하지 않는다. 기존 PR이 있으면 수정하지 않고 URL만 알린다.
- `.env`, API 키 등 비밀 정보가 diff에 보이면 PR을 만들지 말고 사용자에게 알린다.
- PR 제목, 본문, 보고는 선택한 언어 하나로 통일한다. 한 PR에 두 언어를 섞지 않는다.
