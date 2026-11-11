#!/bin/bash
# git pushを検知してツール実行を止めるフック
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# コマンド名の直前(絶対パスの / や別シェルでの包みも含む)
P='(^|[;&|("'"'"'`/]|\s)'
# コマンド名の直後(git pushed や push-foo は除く)
E='([^A-Za-z0-9_-]|$)'
# コマンド名とサブコマンドの間に挟まるオプション
O='(\s+-[^ ]+(\s+[^ -][^ ]*)?)*'

for re in \
  "${P}git${O}\s+push${E}" ; do
  if echo "$command" | grep -Eq "$re"; then
    echo "git pushは禁止されています。実行すべきコマンドを示してユーザーに実行を依頼してください" >&2
    exit 2
  fi
done
exit 0
