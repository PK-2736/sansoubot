#!/bin/bash
# データベースバックアップスクリプト
# 使い方: ./backup-db.sh

BACKUP_DIR="$HOME/sansoubot_backups"
DB_FILE="prisma/dev.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/dev.db.backup.$TIMESTAMP"

# バックアップディレクトリを作成
mkdir -p "$BACKUP_DIR"

# データベースファイルが存在するか確認
if [ ! -f "$DB_FILE" ]; then
    echo "❌ エラー: $DB_FILE が見つかりません"
    exit 1
fi

# バックアップを作成
cp "$DB_FILE" "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ バックアップ成功: $BACKUP_FILE"
    
    # データ件数を表示
    echo ""
    echo "📊 データ件数:"
    sqlite3 "$DB_FILE" "SELECT 'UserMountain: ' || COUNT(*) FROM UserMountain; SELECT 'QuizQuestion: ' || COUNT(*) FROM QuizQuestion; SELECT 'QuizScore: ' || COUNT(*) FROM QuizScore;"
    
    # 古いバックアップを削除（30日以上前のもの）
    find "$BACKUP_DIR" -name "dev.db.backup.*" -mtime +30 -delete
    echo ""
    echo "🗑️  30日以上前のバックアップを削除しました"
    
    # 現在のバックアップ数を表示
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/dev.db.backup.* 2>/dev/null | wc -l)
    echo "📁 現在のバックアップ数: $BACKUP_COUNT"
else
    echo "❌ バックアップ失敗"
    exit 1
fi
