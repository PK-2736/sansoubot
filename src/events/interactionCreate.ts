import { Interaction, ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { log } from '../utils/logger';
import { loadLatestQuiz } from '../utils/quiz';
import quizState from '../utils/quizState';
import { prisma } from '../utils/db';

type CommandExecute = (interaction: ChatInputCommandInteraction) => Promise<any>;
type CommandMap = Record<string, CommandExecute>;

export default function createInteractionHandler(commands: CommandMap) {
  return async (interaction: Interaction) => {
  // クイズ用のボタン操作を処理します
    try {
      if (interaction.isButton && interaction.isButton()) {
        const id = interaction.customId;
        if (id && id.startsWith('quiz:')) {
          // start/giveup/answer:<idx>（開始・回答等のカスタム ID）
          if (id === 'quiz:start') {
            const qs = loadLatestQuiz();
            if (!qs) {
              await interaction.reply({ content: '現在利用可能なクイズがありません。/quiz_start を実行してクイズを作成してください。', flags: (await import('../utils/flags')).EPHEMERAL });
              return;
            }
            const key = `${interaction.user.id}:${Date.now()}`;
            quizState.createSession(key, qs, interaction.user.id);
            // 最初の問題を送信
            const s = quizState.getSession(key)!;
            s.startAt = Date.now();
            const q = s.questions[0];
            // 選択肢用のボタンを作成
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
            const row = new ActionRowBuilder<any>();
            q.choices.forEach((c, idx) => row.addComponents(new ButtonBuilder().setCustomId(`quiz:answer:${encodeURIComponent(key)}:${idx}`).setLabel(c).setStyle(ButtonStyle.Primary)));
            // 埋め込みメッセージで元メッセージを更新（シングルメッセージ運用）
            const { EmbedBuilder } = await import('discord.js');
            const eb = new EmbedBuilder().setTitle(`問題 1/${s.questions.length}`).setDescription(q.prompt).addFields({ name: '選択肢', value: q.choices.map((c, i) => `${i + 1}. ${c}`).join('\n') }).setFooter({ text: `暫定 正答: 0 | 経過: 0s` });
            await interaction.update({ embeds: [eb], components: [row] });
            return;
          }
          // (giveup button removed)
          if (id.startsWith('quiz:answer:')) {
            const parts = id.split(':');
            const key = decodeURIComponent(parts[2]);
            const idx = Number(parts[3]);
            const s = quizState.getSession(key);
            if (!s) {
              await interaction.update({ content: 'セッションが見つかりません（期限切れなど）。', components: [] }).catch(() => {});
              return;
            }
            const q = s.questions[s.current];
            const now = Date.now();
            const timeMs = now - (s.startAt ?? now);
            const correct = idx === q.answerIndex;
            quizState.advanceSession(key, timeMs, correct);
            // next
            if (s.current >= s.questions.length) {
              const totalTime = s.times.reduce((a, b) => a + b, 0);
              const score = s.correct * 1000 - Math.round(totalTime / 1000);
                // 内部保存 (Prisma/SQLite) でユーザーのベストスコアを更新
                let bestUpdated = false;
                try {
                  // 1) user_id で既存レコードを検索
                  let found = await prisma.quizScore.findUnique({ where: { user_id: s.userId } }).catch(() => null);

                  // 2) 見つからない場合は、匿名（user_id が null）の同名ユーザーを検索してリンク
                  if (!found) {
                    const anon = await prisma.quizScore.findFirst({ where: { username: interaction.user.username, user_id: null } }).catch(() => null);
                    if (anon) {
                      try {
                        await prisma.quizScore.update({ where: { id: anon.id }, data: { user_id: s.userId } });
                        found = { ...anon, user_id: s.userId } as any;
                      } catch (linkErr: any) {
                        log('failed to link anonymous quiz_score to user_id:', linkErr);
                      }
                    }
                  }

                  // 3) まだなければ新規作成、あればベスト更新
                  if (!found) {
                    await prisma.quizScore.create({ data: { user_id: s.userId, username: interaction.user.username, score, time_ms: totalTime } });
                    bestUpdated = true;
                  } else {
                    const prevScore = (found.score ?? 0) as number;
                    if (score > prevScore) {
                      await prisma.quizScore.update({ where: { id: found.id }, data: { score, time_ms: totalTime, username: interaction.user.username } });
                      bestUpdated = true;
                    }
                  }
                } catch (e) {
                  log('failed to save quiz score', e);
                }
              const { EmbedBuilder } = await import('discord.js');
                // 全問の正答を列挙
                const answerLines = s.questions.map((q, i) => {
                  const ansNum = (q.answerIndex ?? 0) + 1;
                  const ansText = q.choices?.[q.answerIndex] ?? q.answerText ?? '';
                  return `Q${i + 1}: ${q.prompt}\nA${i + 1}: ${ansNum}. ${ansText}`;
                });
                const desc = `正答数: ${s.correct}/${s.questions.length}\nスコア: ${score}` + (bestUpdated ? '\n\n🎉 ベストスコアを更新しました！' : '\n\n（ベストスコアは保持されました）') +
                  '\n\n---\n【全問の正答】\n' + answerLines.join('\n');
                const eb = new EmbedBuilder().setTitle('クイズ終了').setDescription(desc).addFields({ name: '所要時間', value: `${Math.round(totalTime/1000)}s` });
              await interaction.update({ embeds: [eb], components: [] }).catch(() => {});
              quizState.deleteSession(key);
            } else {
              // send next question
              const next = s.questions[s.current];
              s.startAt = Date.now();
              const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
              const row = new ActionRowBuilder<any>();
              next.choices.forEach((c, i) => row.addComponents(new ButtonBuilder().setCustomId(`quiz:answer:${encodeURIComponent(key)}:${i}`).setLabel(c).setStyle(ButtonStyle.Primary)));
              const { EmbedBuilder } = await import('discord.js');
              const eb2 = new EmbedBuilder().setTitle(`問題 ${s.current + 1}/${s.questions.length}`).setDescription(next.prompt).addFields({ name: '選択肢', value: next.choices.map((c, i) => `${i + 1}. ${c}`).join('\n') }).setFooter({ text: `暫定 正答: ${s.correct} | 経過: ${Math.round((s.times.reduce((a,b)=>a+b,0))/1000)}s` });
              await interaction.update({ embeds: [eb2], components: [row] }).catch(() => {});
            }
            return;
          }
        }
      }
    } catch (err) {
      // continue to normal command routing on errors
      log('quiz button handling error', err);
    }

    // モーダル送信の処理
    if (interaction.isModalSubmit && interaction.isModalSubmit()) {
      const modal = interaction as ModalSubmitInteraction;
      try {
  // customId による振り分け
        if (modal.customId === 'mountain_add_modal') {
          // @ts-ignore - module or its type declaration may be missing at compile time
          const handler = await import('../commands/mountain/addModal');
          await handler.default(modal);
        }
      } catch (err) {
        log('modal handler error:', err);
  try { await interaction.reply({ content: 'モーダルの処理に失敗しました。', flags: (await import('../utils/flags')).EPHEMERAL }); } catch (_) {}
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

  // ギルドごとのコマンド許可リスト
    let guildCommandsMap: Record<string, string[]> = { default: ['*'] };
    try {
  // コンフィグファイルは任意
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cfg = await import('../../config/guild-commands.json');
      guildCommandsMap = (cfg as any) || guildCommandsMap;
    } catch (_) {}

    const cmd = commands[interaction.commandName];
    if (!cmd) {
      await interaction.reply({ content: '未対応のコマンドです。', flags: (await import('../utils/flags')).EPHEMERAL });
      return;
    }

  // このギルドでコマンドが許可されているかを確認
    const gid = interaction.guildId ?? 'default';
    const allowed = guildCommandsMap[gid] ?? guildCommandsMap['default'] ?? ['*'];
    if (!(allowed.includes('*') || allowed.includes(interaction.commandName))) {
      await interaction.reply({ content: 'このコマンドは現在開発中のため利用できません。', flags: (await import('../utils/flags')).EPHEMERAL });
      return;
    }

    try {
  // ここで一律に defer しないでください。個々のコマンドが必要時に defer します。
      await cmd(interaction as ChatInputCommandInteraction);
    } catch (err) {
      log(`Command '${interaction.commandName}' failed:`, err);
      const msg = 'コマンド実行中にエラーが発生しました。';
        if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, flags: (await import('../utils/flags')).EPHEMERAL }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: (await import('../utils/flags')).EPHEMERAL }).catch(() => {});
      }
    }
  };
}
