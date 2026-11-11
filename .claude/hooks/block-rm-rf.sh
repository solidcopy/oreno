#!/bin/bash
# rm -rfを検知してツール実行を止めるフック
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# コマンド名の直前(絶対パスの / や別シェルでの包みも含む)
P='(^|[;&|("'"'"'`/]|\s)'
# コマンド名の直後(rm-foo などは除く)
E='([^A-Za-z0-9_-]|$)'

# フラグの順序や書き方(-rf、-fr、-r -f、--recursive --force)に依らず検知する
for re in \
  "${P}rm(\s+[^ ;&|]+)*\s+-[a-zA-Z]*[rR][a-zA-Z]*[fF]" \
  "${P}rm(\s+[^ ;&|]+)*\s+-[a-zA-Z]*[fF][a-zA-Z]*[rR]" \
  "${P}rm(\s+[^ ;&|]+)*\s+(-r|-R|--recursive)\s+(\S+\s+)*(-f|--force)${E}" \
  "${P}rm(\s+[^ ;&|]+)*\s+(-f|--force)\s+(\S+\s+)*(-r|-R|--recursive)${E}" ; do
  if echo "$command" | grep -Eq "$re"; then
    echo "rm -rfは禁止されています。実行すべきコマンドを示してユーザーに実行を依頼してください" >&2
    exit 2
  fi
done
exit 0
