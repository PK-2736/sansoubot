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
        
        // 山の承認・却下ボタン
        if (id && id.startsWith('mountain_approve_')) {
          const mountainId = id.replace('mountain_approve_', '');
          try {
            const mountain = await prisma.userMountain.findUnique({ where: { id: mountainId } });
            if (!mountain) {
              await interaction.reply({ content: '山が見つかりません。', flags: (await import('../utils/flags')).EPHEMERAL });
              return;
            }

            // 承認
            await prisma.userMountain.update({ where: { id: mountainId }, data: { approved: true } });

            // 投稿者にDM送信
            if (mountain.added_by) {
              try {
                const addedByUser = await interaction.client.users.fetch(mountain.added_by);
                const approveEmbed = new (await import('discord.js')).EmbedBuilder()
                .setTitle('✅ 山が承認されました！')
                .setDescription(mountain.name)
                .setColor(0x4caf50)
                .setTimestamp();

                await addedByUser.send({ embeds: [approveEmbed] });
                log(`[MountainApprove] Sent approval DM to ${mountain.added_by}`);
              } catch (dmErr: any) {
                log('[MountainApprove] Failed to send DM:', dmErr?.message);
              }
            }

            // ボタンを無効化してメッセージを更新
            try {
              const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
              const disabledApprove = new ButtonBuilder()
                .setCustomId(`mountain_approve_${mountainId}`)
                .setLabel('承認済み')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true);
              const disabledReject = new ButtonBuilder()
                .setCustomId(`mountain_reject_${mountainId}`)
                .setLabel('却下')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true);
              const disabledRow = new ActionRowBuilder().addComponents(disabledApprove, disabledReject).toJSON();
              await interaction.message.edit({ components: [disabledRow] });
            } catch (editErr: any) {
              log('[MountainApprove] Failed to disable buttons:', editErr?.message);
            }

            await interaction.reply({ content: `✅ 山「${mountain.name}」を承認しました。投稿者にDMを送信しました。`, flags: (await import('../utils/flags')).EPHEMERAL });
          } catch (err: any) {
            log('[MountainApprove] Error:', err?.message);
            await interaction.reply({ content: '承認処理に失敗しました。', flags: (await import('../utils/flags')).EPHEMERAL });
          }
          return;
        }

        if (id && id.startsWith('mountain_reject_')) {
          const mountainId = id.replace('mountain_reject_', '');
          try {
            const mountain = await prisma.userMountain.findUnique({ where: { id: mountainId } });
            if (!mountain) {
              await interaction.reply({ content: '山が見つかりません。', flags: (await import('../utils/flags')).EPHEMERAL });
              return;
            }

            // モーダルを表示
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
            const modal = new ModalBuilder()
              .setCustomId(`mountain_reject_reason_${mountainId}`)
              .setTitle('却下理由');

            const reasonInput = new TextInputBuilder()
              .setCustomId('reject_reason')
              .setLabel('却下理由')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('例：不適切な内容です')
              .setRequired(true)
              .setMaxLength(500);

            const row = new ActionRowBuilder().addComponents(reasonInput);
            modal.addComponents(row as any);
            await interaction.showModal(modal);
          } catch (err: any) {
            log('[MountainReject] Error showing modal:', err?.message);
            await interaction.reply({ content: 'モーダル表示に失敗しました。', flags: (await import('../utils/flags')).EPHEMERAL });
          }
          return;
        }
        
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
            const answerRow = new ActionRowBuilder<any>();
            q.choices.forEach((c, idx) => answerRow.addComponents(new ButtonBuilder().setCustomId(`quiz:answer:${encodeURIComponent(key)}:${idx}`).setLabel(c).setStyle(ButtonStyle.Primary)));
            // リタイヤボタンを追加
            const quitRow = new ActionRowBuilder<any>().addComponents(
              new ButtonBuilder().setCustomId(`quiz:quit:${encodeURIComponent(key)}`).setLabel('リタイヤ').setStyle(ButtonStyle.Danger)
            );
            // 埋め込みメッセージで元メッセージを更新（シングルメッセージ運用）
            const { EmbedBuilder } = await import('discord.js');
            const eb = new EmbedBuilder().setTitle(`問題 1/${s.questions.length}`).setDescription(q.prompt).addFields({ name: '選択肢', value: q.choices.map((c, i) => `${i + 1}. ${c}`).join('\n') }).setFooter({ text: `暫定 正答: 0 | 経過: 0s` });
            await interaction.update({ embeds: [eb], components: [answerRow, quitRow] });
            return;
          }
          // リタイヤボタンの処理
          if (id.startsWith('quiz:quit:')) {
            const parts = id.split(':');
            const key = decodeURIComponent(parts[2]);
            const s = quizState.getSession(key);
            if (!s) {
              await interaction.update({ content: 'セッションが見つかりません。', components: [] }).catch(() => {});
              return;
            }
            quizState.deleteSession(key);
            const { EmbedBuilder } = await import('discord.js');
            const eb = new EmbedBuilder().setTitle('クイズをリタイヤしました').setDescription(`${s.current}問目でリタイヤ\n正答数: ${s.correct}/${s.current}`).setColor(0xff0000);
            await interaction.update({ embeds: [eb], components: [] }).catch(() => {});
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
              const answerRow = new ActionRowBuilder<any>();
              next.choices.forEach((c, i) => answerRow.addComponents(new ButtonBuilder().setCustomId(`quiz:answer:${encodeURIComponent(key)}:${i}`).setLabel(c).setStyle(ButtonStyle.Primary)));
              // リタイヤボタンを追加
              const quitRow = new ActionRowBuilder<any>().addComponents(
                new ButtonBuilder().setCustomId(`quiz:quit:${encodeURIComponent(key)}`).setLabel('リタイヤ').setStyle(ButtonStyle.Danger)
              );
              const { EmbedBuilder } = await import('discord.js');
              const eb2 = new EmbedBuilder().setTitle(`問題 ${s.current + 1}/${s.questions.length}`).setDescription(next.prompt).addFields({ name: '選択肢', value: next.choices.map((c, i) => `${i + 1}. ${c}`).join('\n') }).setFooter({ text: `暫定 正答: ${s.correct} | 経過: ${Math.round((s.times.reduce((a,b)=>a+b,0))/1000)}s` });
              await interaction.update({ embeds: [eb2], components: [answerRow, quitRow] }).catch(() => {});
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
        } else if (modal.customId === 'report_modal') {
          // 不具合報告フォーム処理
          try {
            const title = modal.fields.getTextInputValue('report_title');
            const details = modal.fields.getTextInputValue('report_details');
            const steps = modal.fields.getTextInputValue('report_steps') || '（記入なし）';

            // ユーザー情報を取得
            const user = modal.user;
            const guild = modal.guild;

            // DM送信先のユーザーID
            const REPORT_USER_ID = '726195003780628621';

            try {
              const reportUser = await interaction.client.users.fetch(REPORT_USER_ID);
              const reportEmbed = (await import('discord.js')).EmbedBuilder
                ? new (await import('discord.js')).EmbedBuilder()
                : undefined;

              if (reportEmbed) {
                reportEmbed
                  .setTitle('🚨 不具合報告')
                  .setDescription(title)
                  .addFields(
                    { name: '報告者', value: `${user.username}#${user.discriminator}\n(ID: ${user.id})` },
                    { name: 'ギルド', value: guild ? guild.name : 'DM' },
                    { name: '詳細', value: details },
                    { name: '再現手順', value: steps }
                  )
                  .setColor(0xff0000)
                  .setTimestamp();

                await reportUser.send({ embeds: [reportEmbed] });
              } else {
                // fallback
                await reportUser.send(
                  `🚨 不具合報告\n` +
                  `タイトル: ${title}\n` +
                  `報告者: ${user.username} (ID: ${user.id})\n` +
                  `ギルド: ${guild?.name || 'DM'}\n` +
                  `詳細: ${details}\n` +
                  `再現手順: ${steps}`
                );
              }

              log(`[Report] Sent report to ${REPORT_USER_ID}: ${title}`);
              await modal.reply({ content: '✅ 不具合報告を送信しました。ご協力ありがとうございます！', flags: (await import('../utils/flags')).EPHEMERAL });
            } catch (dmError: any) {
              log('[Report] Failed to send DM:', dmError?.message ?? dmError);
              await modal.reply({ content: '❌ 報告の送信に失敗しました。管理者に直接ご連絡ください。', flags: (await import('../utils/flags')).EPHEMERAL });
            }
          } catch (parseError: any) {
            log('[Report] Error parsing modal fields:', parseError?.message ?? parseError);
            await modal.reply({ content: 'フォーム情報の読み込みに失敗しました。', flags: (await import('../utils/flags')).EPHEMERAL });
          }
        } else if (modal.customId.startsWith('mountain_reject_reason_')) {
          // 山却下理由モーダル処理
          try {
            const mountainId = modal.customId.replace('mountain_reject_reason_', '');
            const reason = modal.fields.getTextInputValue('reject_reason');

            // 投稿者の情報を取得
            const mountain = await prisma.userMountain.findUnique({ where: { id: mountainId } });
            if (!mountain) {
              await modal.reply({ content: '山情報が見つかりません。', flags: (await import('../utils/flags')).EPHEMERAL });
              return;
            }

            // 山を削除
            await prisma.userMountain.delete({ where: { id: mountainId } });

            // 投稿者にDM送信
            if (mountain.added_by) {
              try {
                const addedByUser = await interaction.client.users.fetch(mountain.added_by);
                const rejectEmbed = new (await import('discord.js')).EmbedBuilder()
                  .setTitle('⛔ 山の追加が却下されました')
                  .setDescription(mountain.name)
                  .addFields(
                    { name: '理由', value: reason },
                    { name: '日時', value: new Date().toLocaleString('ja-JP') }
                  )
                  .setColor(0xff5722)
                  .setTimestamp();

                await addedByUser.send({ embeds: [rejectEmbed] });
                log(`[MountainReject] Sent rejection DM to ${mountain.added_by}`);
              } catch (dmErr: any) {
                log('[MountainReject] Failed to send DM:', dmErr?.message);
              }
            }

            // 元のメッセージを削除
            try {
              const notificationChannelId = '1459847925092978709';
              const channel = await interaction.client.channels.fetch(notificationChannelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const messages = await (channel as any).messages.fetch({ limit: 100 });
                const targetMsg = messages.find((msg: any) => 
                  msg.embeds?.[0]?.fields?.some((f: any) => f.name === '投稿ID' && f.value === mountainId)
                );
                if (targetMsg) {
                  await targetMsg.delete();
                }
              }
            } catch (deleteErr: any) {
              log('[MountainReject] Failed to delete notification message:', deleteErr?.message);
            }

            await modal.reply({ content: `✅ 山「${mountain.name}」を却下しました。投稿者にDMを送信しました。`, flags: (await import('../utils/flags')).EPHEMERAL });
          } catch (parseErr: any) {
            log('[MountainReject] Error:', parseErr?.message);
            await modal.reply({ content: '却下処理に失敗しました。', flags: (await import('../utils/flags')).EPHEMERAL });
          }
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
      guildCommandsMap = (cfg as any)?.default || (cfg as any) || guildCommandsMap;
    } catch (_) {}

    const cmd = commands[interaction.commandName];
    if (!cmd) {
      await interaction.reply({ content: '未対応のコマンドです。', flags: (await import('../utils/flags')).EPHEMERAL });
      return;
    }

  // このギルドでコマンドが許可されているかを確認
    const gid = interaction.guildId ?? 'default';
    const allowed = guildCommandsMap[gid] ?? guildCommandsMap['default'] ?? ['*'];
    if (!(Array.isArray(allowed) && (allowed.includes('*') || allowed.includes(interaction.commandName)))) {
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
