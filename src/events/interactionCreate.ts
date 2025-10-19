import { Interaction, ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { log } from '../utils/logger';
import { loadLatestQuiz } from '../utils/quiz';
import quizState from '../utils/quizState';
import { supabase } from '../utils/db';

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
                // save to supabase and update best score per user
                let bestUpdated = false;
                if (supabase) {
                  try {
                    // 1) try to find existing by user_id
                    const { data: existing, error: fetchErr } = await supabase.from('quiz_scores').select('id,score').eq('user_id', s.userId).maybeSingle();
                    if (fetchErr) log('supabase fetch error (by user_id):', fetchErr);
                    let found = existing as any | null;

                    // 2) fallback: match by username where user_id is null (anonymous)
                    if (!found) {
                      const { data: anon, error: anonErr } = await supabase.from('quiz_scores').select('id,score').eq('username', interaction.user.username).is('user_id', null).maybeSingle();
                      if (anonErr) log('supabase fetch error (by username):', anonErr);
                      if (anon) {
                        // link the anonymous row to this user
                        const { error: linkErr } = await supabase.from('quiz_scores').update({ user_id: s.userId }).eq('id', (anon as any).id);
                        if (linkErr) {
                          log('failed to link anonymous quiz_score to user_id:', linkErr);
                        } else {
                          found = { id: (anon as any).id, score: (anon as any).score } as any;
                        }
                      }
                    }

                    // 3) If still not found, insert new
                    if (!found) {
                      const { error: insertErr } = await supabase.from('quiz_scores').insert([{ user_id: s.userId, username: interaction.user.username, score, time_ms: totalTime }]);
                      if (insertErr) {
                        log('supabase insert error (quiz_scores):', insertErr);
                      } else {
                        bestUpdated = true;
                      }
                    } else {
                      const prevScore = (found as any).score as number || 0;
                      if (score > prevScore) {
                        const { error: updateErr } = await supabase.from('quiz_scores').update({ score, time_ms: totalTime, username: interaction.user.username }).eq('id', (found as any).id);
                        if (updateErr) log('supabase update error (quiz_scores):', updateErr);
                        else bestUpdated = true;
                      }
                    }
                  } catch (e) {
                    log('failed to save quiz score', e);
                  }
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
