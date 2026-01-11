#!/bin/bash
# 使い方: ./git.sh [コミットメッセージ]
# 引数がない場合は自動的に "test" を使用

COMMIT_MESSAGE="${1:-test}"

git add .
git commit -m "$COMMIT_MESSAGE"
git push origin main