# コマンド削除・グローバル登録の実行手順

## ステップ1: コマンド削除スクリプトをダウンロード

開発環境で作成したスクリプトをサーバーにコピー：

```bash
scp /workspaces/sansoubot/delete-commands.js ubuntu@<サーバーIP>:/home/ubuntu/sansoubot/
```

または、サーバー上で直接作成：

```bash
ssh ubuntu@<サーバーIP>
cd /home/ubuntu/sansoubot

cat > delete-commands.js << 'EOF'
require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN) {
  console.error('Error: DISCORD_TOKEN not set in .env');
  process.exit(1);
}

if (!DISCORD_CLIENT_ID) {
  console.error('Error: DISCORD_CLIENT_ID not set in .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Fetching commands for application ${DISCORD_CLIENT_ID}...\n`);
    const commands = await rest.get(Routes.applicationCommands(DISCORD_CLIENT_ID));
    
    console.log(`Found ${commands.length} global commands:`);
    commands.forEach(cmd => console.log(`  - /${cmd.name}`));
    
    const toDelete = ['weather_forecast', 'map_route'];
    
    for (const cmd of commands) {
      if (toDelete.includes(cmd.name)) {
        console.log(`\nDeleting /${cmd.name} (ID: ${cmd.id})...`);
        await rest.delete(Routes.applicationCommand(DISCORD_CLIENT_ID, cmd.id));
        console.log(`  ✓ Successfully deleted /${cmd.name}`);
      }
    }
    
    console.log('\n✅ Done! Fetching remaining commands...\n');
    const remaining = await rest.get(Routes.applicationCommands(DISCORD_CLIENT_ID));
    console.log(`Remaining ${remaining.length} global commands:`);
    remaining.forEach(cmd => console.log(`  - /${cmd.name}`));
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
EOF
```

## ステップ2: スクリプトを実行して古いコマンドを削除

```bash
node delete-commands.js
```

## ステップ3: PM2を再起動（新しいグローバルコマンドを登録）

```bash
pm2 stop mountain-bot
pm2 delete mountain-bot
cd /home/ubuntu/sansoubot
npm run pm2:start

# ログで確認
pm2 logs mountain-bot --lines 15
```

## 期待される出力

```
[mountain-bot] 山荘#5464 is ready.
[mountain-bot] Registering commands globally...
[mountain-bot] Registered 7 slash commands globally.
```

## 注意事項

- `DISCORD_CLIENT_ID` が .env に設定されていない場合は、先に設定してください
- スクリプト実行後、Discord上に反映されるまで1-2分かかることがあります
- Discordを再起動（ホーム画面から出入りなど）すると即座に反映されます
