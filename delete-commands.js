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
