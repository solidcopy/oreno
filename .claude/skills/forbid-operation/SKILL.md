---
name: forbid-operation
description: Claudeに実行させたくない操作(例:git push、rm -rf、特定ファイルの編集)を禁止するための設定一式を作るスキルです。「〜を禁止して」「〜をClaudeにやらせないで」「〜できないようにして」「勝手に〜しないようにして」と言われたときは、必ずこのスキルを使ってください。禁止の意思を、(1)文書への明記、(2)パーミッションのdeny、(3)PreToolUseフックによる実行阻止の3層で設定します。
disable-model-invocation: true
---

# 操作の禁止

禁止したい操作をユーザーから聞き、次の3層で実行できなくする。
文書だけだと破られうるし、パーミッションだけだとコマンドの書き方次第で素通りするので、層を重ねる。

## 手順

### 1. 禁止する操作を特定する

ユーザーの言葉から次を決める。曖昧なら聞き返す。

- 操作の内容(例:`git push`)
- コマンド実行(Bash)か、それ以外か(ファイル編集、MCPツール、Web取得など)
- 特定の作業でしか使わない操作か(例:デプロイ作業でしか使わない `docker push`)

### 2. 文書に明記する

禁止の意思をClaudeに直接伝える層。次のどちらか一方に書く。

- **特定の作業でしか使わない操作** → その作業のときに参照されるSKILL(`.claude/skills/*/SKILL.md`)に「〜はしない」と書く。該当するSKILLが複数あれば全部に書く。作業に該当するSKILLが無ければCLAUDE.mdに書く
- **それ以外** → CLAUDE.mdに書く

書くときは、禁止の理由が分かっていれば一言添える(理由があると、似た別の操作にも判断が効く)。
すでに同じ趣旨の記述があれば追記せず、重複を避ける。
CLAUDE.mdのスタイル(見出しの付け方、口調)に合わせる。

### 3. パーミッションで禁止する

`.claude/settings.json`(チェックイン対象。無ければ作る)の `permissions.deny` に追加する。既存の設定は壊さずマージする。

コマンド実行の場合:

```json
{
  "permissions": {
    "deny": [
      "Bash(git push)",
      "Bash(git push *)"
    ]
  }
}
```

引数なしと引数ありの両方を書く(`Bash(git push *)` は引数なしに一致しない)。
コマンド以外なら、対応するルールを使う。例:`Edit(path/**)`、`Read(path/**)`、`WebFetch(domain:example.com)`、`mcp__server__tool`。

### 4. PreToolUseフックで止める

パーミッションのdenyは、`git -C dir push` や `bash -c "git push"` のような書き方を取りこぼすことがある。フックで正規表現により広く検知して止める層を足す。

`.claude/hooks/block-<操作名>.sh` を作る。

```bash
#!/bin/bash
# <操作>を検知してツール実行を止めるフック
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

P='(^|[;&|("'"'"'`/]|\s)'         # コマンド名の直前(絶対パス・相対パスの / や、別シェルでの包みも含む)
E='([^A-Za-z0-9_-]|$)'             # コマンド名の直後(git pushed や push-foo は除く)
O='(\s+-[^ ]+(\s+[^ -][^ ]*)?)*'   # コマンド名とサブコマンドの間に挟まるオプション

for re in \
  "${P}git${O}\s+push${E}" ; do
  if echo "$command" | grep -Eq "$re"; then
    echo "<操作>は禁止されています。ユーザーに実行を依頼してください" >&2
    exit 2
  fi
done
exit 0
```

検知したい書き方は `for` の中に1行ずつ足す。例:

```bash
# サブコマンド型(オプションが間に入る): terraform -chdir=env/prod apply など
"${P}terraform${O}\s+apply${E}"
# フラグの順序が自由なコマンド: rm -rf / -fr / -r -f / --recursive --force / rm dir -rf など
"${P}rm(\s+[^ ;&|]+)*\s+-[a-zA-Z]*[rR][a-zA-Z]*[fF]"
"${P}rm(\s+[^ ;&|]+)*\s+-[a-zA-Z]*[fF][a-zA-Z]*[rR]"
"${P}rm(\s+[^ ;&|]+)*\s+(-r|-R|--recursive)\s+(\S+\s+)*(-f|--force)${E}"
```

ポイント:

- `sudo` や `bash -c '...'`、`/usr/bin/git` のような絶対パスは、直前の文字の判定で検知できる
- 通すべき例(`git commit -m "push fix"`、`terraform plan`、`rm -r dir`、`rm -f file`)を誤検知しないか、手順5で必ず確かめる

- 終了コード2で止まり、stderrの内容がClaudeにフィードバックされる
- `.claude/settings.json` の `hooks.PreToolUse` に登録する。実行権限の付与が要らないよう `bash` 経由で呼ぶ

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-git-push.sh" }
        ]
      }
    ]
  }
}
```

- Bash以外のツールを禁止するなら、`matcher` をそのツール名(`Edit|Write`、`mcp__server__.*` など)にし、スクリプトは `tool_input` の該当フィールド(`file_path` など)を見る
- 同じ `matcher` のエントリが既にあれば、`hooks` 配列に足す

### 5. 動作を確かめる

- `jq . .claude/settings.json` でJSONの構文を確認する
- フックに実際の入力を流して、止まる例と通る例を両方確認する。止まる例には、オプションが間に入る書き方、`bash -c '...'` での包み、絶対パスでの呼び出しを必ず含める

```bash
echo '{"tool_input":{"command":"git -C . push origin main"}}' | bash .claude/hooks/block-git-push.sh; echo "exit=$?"   # 2になる
echo '{"tool_input":{"command":"/usr/bin/git push"}}' | bash .claude/hooks/block-git-push.sh; echo "exit=$?"            # 2になる
echo '{"tool_input":{"command":"git status"}}' | bash .claude/hooks/block-git-push.sh; echo "exit=$?"                    # 0になる
```

### 6. 禁止できなかった層を報告する

パーミッションとフックのどちらかで止められない操作がある(例:Claudeが使う手段がコマンドでもツールでもない、ユーザーが手元で実行する操作など)場合は、どの層が効かないかと理由をユーザーに報告する。
文書への明記だけが効く状態であれば、その旨も明示する。

フックによる検知は、コマンドの文字列を照合しているだけなので、次のような実行時にコマンドを組み立てる書き方は止められない。禁止の設定が完了したら、この限界を必ずユーザーに伝える。

- 変数や `eval` で組み立てる(`cmd=terraform; $cmd apply`、`eval "ter""raform apply"`)
- エンコードして渡す(`echo ... | base64 -d | sh`)
- `alias` で別名を付ける
- スクリプトファイルの中に書いて実行する

これらに備えられるのは、文書への明記と、サンドボックスなどの実行環境側の制限になる。

### 7. 不可欠な操作ならユーザー代行を依頼する旨をCLAUDE.mdに書く

禁止した操作が、ユーザーの依頼するタスクの達成に不可欠な場合(例:デプロイ作業での `git push`)は、Claudeが自分で回避策を探さず、ユーザーに実行を頼むようにする。
CLAUDE.mdに次の趣旨の記述が**すでにあれば追記しない**。無ければ追加する。

> 禁止されている操作がタスクの達成に不可欠な場合は、代わりの手段で回避せず、実行すべきコマンドを示してユーザーに実行を依頼してください。

## 注意

- サンドボックス下ではBashから `.claude/settings.json` や `.claude/hooks/`、`.claude/skills/` へ書き込めないことがある。その場合は Write / Edit ツールで編集する
- 設定ファイルの変更は、反映にセッションの再起動やフックの再読込(`/hooks`)が必要になることがある。反映が必要な場合はユーザーに伝える
- フックのスクリプトにコメントを書くときは、プロジェクトのCLAUDE.mdにあるコメントの文体に従う
