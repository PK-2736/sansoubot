import { ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { log } from '../../utils/logger';

export default {
  data: { name: 'mountain_add' },
  async execute(interaction: ChatInputCommandInteraction) {
    // Show modal for user to input mountain details
    const modal = new ModalBuilder().setCustomId('mountain_add_modal').setTitle('山を追加');
    const nameInput = new TextInputBuilder().setCustomId('name').setLabel('山名').setStyle(TextInputStyle.Short).setRequired(true);
    const elevationInput = new TextInputBuilder().setCustomId('elevation').setLabel('標高（m）').setStyle(TextInputStyle.Short).setRequired(false);
    const locationInput = new TextInputBuilder().setCustomId('location').setLabel('場所（任意）').setStyle(TextInputStyle.Short).setRequired(false);
    const descriptionInput = new TextInputBuilder().setCustomId('description').setLabel('説明（任意）').setStyle(TextInputStyle.Paragraph).setRequired(false);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(elevationInput));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(locationInput));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput));

    await interaction.showModal(modal);
  },
};
