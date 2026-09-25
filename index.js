require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
const mysql = require("mysql2/promise");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

async function setupDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS farms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      item VARCHAR(100) NOT NULL,
      quantidade INT NOT NULL,
      recebeu VARCHAR(100) NOT NULL,
      discord_id VARCHAR(30) NOT NULL,
      status ENUM('pendente','aprovado','reprovado') DEFAULT 'pendente',
      aprovado_por VARCHAR(100) NULL,
      motivo VARCHAR(255) NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function isStaff(interaction) {
  return Boolean(
    process.env.CARGO_STAFF &&
    interaction.member?.roles?.cache?.has(process.env.CARGO_STAFF)
  );
}

client.once("ready", async () => {
  try {
    await setupDatabase();

    const commands = [
      new SlashCommandBuilder()
        .setName("painelfarm")
        .setDescription("Envia o painel para registrar farm."),
      new SlashCommandBuilder()
        .setName("farmhistorico")
        .setDescription("Mostra o histórico de farms aprovados.")
        .addUserOption(o =>
          o.setName("usuario")
            .setDescription("Usuário para consultar")
            .setRequired(false)
        ),
    ].map(c => c.toJSON());

    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log(`Bot online: ${client.user.tag}`);
    console.log("MySQL conectado e tabela verificada.");
  } catch (err) {
    console.error("Erro ao iniciar:", err);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "painelfarm") {
        if (!isStaff(interaction)) {
          return interaction.reply({
            content: "❌ Você não tem permissão para enviar o painel.",
            ephemeral: true,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle("📦 REGISTRO DE FARM")
          .setDescription(
            "Clique no botão abaixo para registrar um farm.\n\n" +
            "Preencha **Nome, Item farmado, Quantidade e Quem recebeu o farm**."
          )
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("registrar_farm")
            .setLabel("Registrar Farm")
            .setEmoji("📦")
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({
          embeds: [embed],
          components: [row],
        });

        return interaction.reply({
          content: "✅ Painel enviado.",
          ephemeral: true,
        });
      }

      if (interaction.commandName === "farmhistorico") {
        if (!isStaff(interaction)) {
          return interaction.reply({
            content: "❌ Você não tem permissão para consultar o histórico.",
            ephemeral: true,
          });
        }

        const user = interaction.options.getUser("usuario");
        const [rows] = user
          ? await db.execute(
              "SELECT * FROM farms WHERE discord_id = ? ORDER BY criado_em DESC LIMIT 10",
              [user.id]
            )
          : await db.execute(
              "SELECT * FROM farms ORDER BY criado_em DESC LIMIT 10"
            );

        if (!rows.length) {
          return interaction.reply({
            content: "📭 Nenhum registro encontrado.",
            ephemeral: true,
          });
        }

        const texto = rows.map(f =>
          `**#${f.id}** • ${f.nome} • ${f.item} • ${f.quantidade} • recebeu: ${f.recebeu} • **${f.status}**`
        ).join("\n");

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("📊 Histórico de Farm")
              .setDescription(texto.slice(0, 4000))
              .setTimestamp()
          ],
          ephemeral: true,
        });
      }
    }

    if (interaction.isButton() && interaction.customId === "registrar_farm") {
      const modal = new ModalBuilder()
        .setCustomId("modal_farm")
        .setTitle("Registro de Farm");

      const nome = new TextInputBuilder()
        .setCustomId("nome")
        .setLabel("Nome")
        .setPlaceholder("Ex: João Silva")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      const item = new TextInputBuilder()
        .setCustomId("item")
        .setLabel("Item farmado")
        .setPlaceholder("Ex: Madeira")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      const quantidade = new TextInputBuilder()
        .setCustomId("quantidade")
        .setLabel("Quantidade")
        .setPlaceholder("Ex: 500")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

      const recebeu = new TextInputBuilder()
        .setCustomId("recebeu")
        .setLabel("Quem recebeu o farm?")
        .setPlaceholder("Nome ou ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nome),
        new ActionRowBuilder().addComponents(item),
        new ActionRowBuilder().addComponents(quantidade),
        new ActionRowBuilder().addComponents(recebeu)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "modal_farm") {
      const nome = interaction.fields.getTextInputValue("nome").trim();
      const item = interaction.fields.getTextInputValue("item").trim();
      const quantidade = Number(
        interaction.fields.getTextInputValue("quantidade").trim()
      );
      const recebeu = interaction.fields.getTextInputValue("recebeu").trim();

      if (!Number.isInteger(quantidade) || quantidade <= 0) {
        return interaction.reply({
          content: "❌ A quantidade precisa ser um número inteiro maior que 0.",
          ephemeral: true,
        });
      }

      const canal = interaction.guild.channels.cache.get(
        process.env.CANAL_APROVACAO
      );

      if (!canal) {
        return interaction.reply({
          content: "❌ Canal de aprovação não encontrado.",
          ephemeral: true,
        });
      }

      const [result] = await db.execute(
        `INSERT INTO farms (nome, item, quantidade, recebeu, discord_id)
         VALUES (?, ?, ?, ?, ?)`,
        [nome, item, quantidade, recebeu, interaction.user.id]
      );

      const farmId = result.insertId;

      const embed = new EmbedBuilder()
        .setTitle("📦 NOVO REGISTRO DE FARM")
        .setDescription(`Registro #${farmId}`)
        .addFields(
          { name: "👤 Nome", value: nome, inline: true },
          { name: "📦 Item farmado", value: item, inline: true },
          { name: "🔢 Quantidade", value: String(quantidade), inline: true },
          { name: "🎁 Quem recebeu", value: recebeu, inline: true },
          { name: "📝 Registrado por", value: `<@${interaction.user.id}>`, inline: true },
          { name: "⏳ Status", value: "Pendente", inline: true }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aprovar_${farmId}`)
          .setLabel("Aprovar")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reprovar_${farmId}`)
          .setLabel("Reprovar")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Danger)
      );

      await canal.send({ embeds: [embed], components: [row] });

      return interaction.reply({
        content: "✅ Registro enviado para aprovação!",
        ephemeral: true,
      });
    }

    if (
      interaction.isButton() &&
      (interaction.customId.startsWith("aprovar_") ||
        interaction.customId.startsWith("reprovar_"))
    ) {
      if (!isStaff(interaction)) {
        return interaction.reply({
          content: "❌ Você não tem permissão para processar farms.",
          ephemeral: true,
        });
      }

      const [acao, farmId] = interaction.customId.split("_");

      const [rows] = await db.execute(
        "SELECT * FROM farms WHERE id = ?",
        [farmId]
      );

      if (!rows.length) {
        return interaction.reply({
          content: "❌ Registro não encontrado.",
          ephemeral: true,
        });
      }

      const farm = rows[0];

      if (farm.status !== "pendente") {
        return interaction.reply({
          content: `⚠️ Esse registro já está **${farm.status}**.`,
          ephemeral: true,
        });
      }

      const status = acao === "aprovar" ? "aprovado" : "reprovado";

      await db.execute(
        `UPDATE farms
         SET status = ?, aprovado_por = ?
         WHERE id = ?`,
        [status, interaction.user.tag, farmId]
      );

      if (status === "aprovado" && process.env.CARGO_APROVADO) {
        const membro = await interaction.guild.members
          .fetch(farm.discord_id)
          .catch(() => null);

        if (membro) {
          await membro.roles.add(process.env.CARGO_APROVADO).catch(() => {});
        }
      }

      const novoEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .spliceFields(5, 1, {
          name: "📌 Status",
          value: status === "aprovado" ? "✅ Aprovado" : "❌ Reprovado",
          inline: true,
        })
        .addFields({
          name: "👮 Processado por",
          value: interaction.user.tag,
          inline: true,
        });

      return interaction.update({
        embeds: [novoEmbed],
        components: [],
      });
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Ocorreu um erro no bot.",
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);
