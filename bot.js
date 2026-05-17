// bot.js — Steal a Brainrot Discord Bot
// Real data from sabexistcount.com | Auto-refreshes every 6 hours | Autocomplete | Variants

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const cron = require("node-cron");
const fs   = require("fs");
const { scrapeAllSources, guessRarity, BRAINROT_SLUGS } = require("./scraper");

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN          = process.env.DISCORD_TOKEN;
const CLIENT_ID      = process.env.CLIENT_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || null;

if (!TOKEN || !CLIENT_ID) {
  console.error("❌  Missing DISCORD_TOKEN or CLIENT_ID. Check your .env file.");
  process.exit(1);
}

const DATA_FILE = "./exist_counts.json";
const META_FILE = "./scrape_meta.json";

// ─── Rarity config ────────────────────────────────────────────────────────────
const RARITY_COLORS = {
  "OG":           0xFFD700,
  "Brainrot God": 0xFF4500,
  "Mythic":       0x9B59B6,
  "Legendary":    0xE91E63,
  "Epic":         0x3498DB,
  "Rare":         0x2ECC71,
  "Common":       0x95A5A6,
  "Secret":       0x1ABC9C,
  "Unknown":      0x99AAB5,
};

const RARITY_EMOJIS = {
  "OG":           "⭐",
  "Brainrot God": "🔥",
  "Mythic":       "💜",
  "Legendary":    "💗",
  "Epic":         "💙",
  "Rare":         "💚",
  "Common":       "⬜",
  "Secret":       "🌀",
  "Unknown":      "❓",
};

// ─── Data helpers ─────────────────────────────────────────────────────────────
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return {}; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function loadMeta() {
  if (!fs.existsSync(META_FILE)) return { lastScrape: null, lastSuccess: null, totalEntries: 0, lastLog: null };
  try { return JSON.parse(fs.readFileSync(META_FILE, "utf8")); }
  catch { return { lastScrape: null, lastSuccess: null, totalEntries: 0, lastLog: null }; }
}

function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// Fuzzy search — finds closest matching brainrot name
function findBrainrot(data, query) {
  const q = query.toLowerCase().trim();
  if (data[q]) return { key: q, ...data[q] };
  const keys = Object.keys(data);
  // partial match
  const partial = keys.find(k => k.includes(q) || q.includes(k));
  if (partial) return { key: partial, ...data[partial] };
  // word match
  const words = q.split(" ").filter(w => w.length > 2);
  const wordMatch = keys.find(k => words.some(w => k.includes(w)));
  if (wordMatch) return { key: wordMatch, ...data[wordMatch] };
  return null;
}

// Get all brainrot names for autocomplete
function getAllNames(data) {
  return Object.values(data).map(b => b.name).filter(Boolean).sort();
}

// ─── Auto-scrape ──────────────────────────────────────────────────────────────
async function runScrape(client) {
  console.log(`[scraper] 🔄 Starting scrape at ${new Date().toISOString()}`);
  const meta = loadMeta();
  meta.lastScrape = Date.now();

  try {
    const { data: scraped, log, total } = await scrapeAllSources();

    if (total > 0) {
      const existing = loadData();

      for (const [key, info] of Object.entries(scraped)) {
        // Don't overwrite manually pinned entries
        if (!existing[key] || existing[key].source !== "manual") {
          existing[key] = info;
        }
      }

      saveData(existing);
      meta.lastSuccess  = Date.now();
      meta.totalEntries = Object.keys(existing).length;
      meta.lastLog      = log;
      console.log(`[scraper] ✅ ${total} scraped. DB total: ${meta.totalEntries}`);

      if (LOG_CHANNEL_ID && client) {
        try {
          const ch = await client.channels.fetch(LOG_CHANNEL_ID);
          if (ch) {
            await ch.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x57F287)
                  .setTitle("🔄 Auto-Refresh Complete")
                  .addFields(
                    { name: "Scraped",   value: `${total}`,              inline: true },
                    { name: "DB Total",  value: `${meta.totalEntries}`,  inline: true },
                    { name: "Failed",    value: `${log.length}`,         inline: true },
                  )
                  .setTimestamp(),
              ],
            });
          }
        } catch (_) {}
      }
    } else {
      console.log("[scraper] ⚠️  0 entries scraped — keeping existing data.");
    }
  } catch (err) {
    console.error("[scraper] ❌ Fatal scrape error:", err.message);
  }

  saveMeta(meta);
}

// ─── Slash Commands ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("existcount")
    .setDescription("Look up a brainrot's exist count")
    .addStringOption(o =>
      o.setName("brainrot")
        .setDescription("Name of the brainrot")
        .setRequired(true)
        .setAutocomplete(true)  // ← dropdown as you type
    ),

  new SlashCommandBuilder()
    .setName("variants")
    .setDescription("Show all mutation variants and their exist counts")
    .addStringOption(o =>
      o.setName("brainrot")
        .setDescription("Name of the brainrot")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("rarest")
    .setDescription("Show the rarest brainrots by exist count")
    .addIntegerOption(o =>
      o.setName("top").setDescription("How many to show (default 10, max 25)").setRequired(false)
    )
    .addStringOption(o =>
      o.setName("rarity")
        .setDescription("Filter by rarity tier")
        .setRequired(false)
        .addChoices(
          { name: "OG",           value: "OG" },
          { name: "Brainrot God", value: "Brainrot God" },
          { name: "Mythic",       value: "Mythic" },
          { name: "Legendary",    value: "Legendary" },
          { name: "Epic",         value: "Epic" },
          { name: "Rare",         value: "Rare" },
          { name: "Secret",       value: "Secret" },
          { name: "Common",       value: "Common" },
        )
    ),

  new SlashCommandBuilder()
    .setName("membercount")
    .setDescription("Show how many members are in this server"),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false))
    .addIntegerOption(o =>
      o.setName("delete_days")
        .setDescription("Days of messages to delete (0-7)")
        .setMinValue(0).setMaxValue(7).setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("scrape")
    .setDescription("[MOD] Trigger a manual data refresh right now")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("scrapestatus")
    .setDescription("Check when data was last refreshed"),

  new SlashCommandBuilder()
    .setName("update")
    .setDescription("[MOD] Manually pin an exist count (scraper won't overwrite it)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName("brainrot").setDescription("Brainrot name").setRequired(true).setAutocomplete(true))
    .addIntegerOption(o => o.setName("count").setDescription("Exist count").setRequired(true))
    .addStringOption(o =>
      o.setName("rarity").setDescription("Rarity tier").setRequired(false)
        .addChoices(
          { name: "OG",           value: "OG" },
          { name: "Brainrot God", value: "Brainrot God" },
          { name: "Mythic",       value: "Mythic" },
          { name: "Legendary",    value: "Legendary" },
          { name: "Epic",         value: "Epic" },
          { name: "Rare",         value: "Rare" },
          { name: "Secret",       value: "Secret" },
          { name: "Common",       value: "Common" },
        )
    )
    .addStringOption(o => o.setName("note").setDescription("Optional note").setRequired(false)),
].map(c => c.toJSON());

// ─── Register Commands ────────────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  console.log("⏳ Registering slash commands...");
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("✅ Commands registered.");
}

// ─── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences],
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("Steal a Brainrot 🧠", { type: 3 });
  await runScrape(client);
  cron.schedule("0 */6 * * *", () => runScrape(client));
  console.log("⏰ Auto-scrape every 6 hours.");
});

// ─── Autocomplete ─────────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {

  if (interaction.isAutocomplete()) {
    const query = interaction.options.getFocused().toLowerCase();
    const data  = loadData();
    const names = getAllNames(data);

    const filtered = names
      .filter(n => n.toLowerCase().includes(query))
      .slice(0, 25) // Discord max
      .map(n => ({ name: n, value: n }));

    return interaction.respond(filtered);
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  // ── /existcount ──────────────────────────────────────────────────────────────
  if (commandName === "existcount") {
    const query  = interaction.options.getString("brainrot");
    const data   = loadData();
    const result = findBrainrot(data, query);

    if (!result) {
      return interaction.reply({
        content: `❌ Couldn't find **${query}**. Data refreshes every 6h — try \`/scrape\` to force a refresh.`,
        flags: 64,
      });
    }

    const meta   = loadMeta();
    const rarity = result.rarity || "Unknown";
    const color  = RARITY_COLORS[rarity] ?? 0x99AAB5;
    const emoji  = RARITY_EMOJIS[rarity] ?? "❓";
    const count  = result.count;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emoji} ${result.name}`)
      .addFields(
        {
          name:   "Exist Count",
          value:  count ? `\`${count.toLocaleString()}\`` : "Unknown",
          inline: true,
        },
        {
          name:   "Rarity",
          value:  rarity,
          inline: true,
        },
      );

    // Rarest mutation
    if (result.rarestMutation) {
      const rarestMut = result.mutations?.find(m => m.name === result.rarestMutation);
      embed.addFields({
        name:   "Rarest Mutation",
        value:  rarestMut
          ? `${result.rarestMutation} — \`${rarestMut.count.toLocaleString()}\``
          : result.rarestMutation,
        inline: true,
      });
    }

    // Rarest trait
    if (result.rarestTrait) {
      const rarestTr = result.traits?.find(t => t.name === result.rarestTrait);
      embed.addFields({
        name:   "Rarest Trait",
        value:  rarestTr
          ? `${result.rarestTrait} — \`${rarestTr.count.toLocaleString()}\``
          : result.rarestTrait,
        inline: true,
      });
    }

    // Top 3 mutations preview
    if (result.mutations?.length > 0) {
      const top3 = result.mutations.slice(0, 3)
        .map(m => `\`${m.name}\` — ${m.count.toLocaleString()}`)
        .join("\n");
      embed.addFields({
        name:  `🧬 Rarest Mutations (use \`/variants\` for full list)`,
        value: top3,
      });
    }

    if (result.note) embed.addFields({ name: "📝 Note", value: result.note });

    embed.setFooter({
      text: `sabexistcount.com • Last refreshed: ${meta.lastSuccess ? new Date(meta.lastSuccess).toUTCString() : "never"}`,
    });

    return interaction.reply({ embeds: [embed] });
  }

  // ── /variants ────────────────────────────────────────────────────────────────
  if (commandName === "variants") {
    const query  = interaction.options.getString("brainrot");
    const data   = loadData();
    const result = findBrainrot(data, query);

    if (!result) {
      return interaction.reply({
        content: `❌ Couldn't find **${query}**.`,
        flags: 64,
      });
    }

    const rarity = result.rarity || "Unknown";
    const color  = RARITY_COLORS[rarity] ?? 0x99AAB5;
    const emoji  = RARITY_EMOJIS[rarity] ?? "❓";

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emoji} ${result.name} — Variants`)
      .setFooter({ text: "sabexistcount.com • sorted by rarest first" });

    // Mutations
    if (result.mutations?.length > 0) {
      const mutLines = result.mutations
        .map(m => `\`${m.name.padEnd(18)}\` ${m.count.toLocaleString()}`)
        .join("\n");
      embed.addFields({ name: "🧬 Mutations", value: `\`\`\`${mutLines}\`\`\`` });
    } else {
      embed.addFields({ name: "🧬 Mutations", value: "No mutation data available." });
    }

    // Traits
    if (result.traits?.length > 0) {
      const traitLines = result.traits
        .slice(0, 15) // cap at 15 to avoid embed limit
        .map(t => `\`${t.name.padEnd(18)}\` ${t.count.toLocaleString()}`)
        .join("\n");
      const suffix = result.traits.length > 15 ? `\n+${result.traits.length - 15} more` : "";
      embed.addFields({ name: "✨ Traits", value: `\`\`\`${traitLines}${suffix}\`\`\`` });
    } else {
      embed.addFields({ name: "✨ Traits", value: "No trait data available." });
    }

    embed.addFields({
      name:  "Base Exist Count",
      value: result.count ? `\`${result.count.toLocaleString()}\`` : "Unknown",
      inline: true,
    });

    return interaction.reply({ embeds: [embed] });
  }

  // ── /rarest ──────────────────────────────────────────────────────────────────
  if (commandName === "rarest") {
    const top           = Math.min(interaction.options.getInteger("top") ?? 10, 25);
    const rarityFilter  = interaction.options.getString("rarity");
    const data          = loadData();
    const meta          = loadMeta();

    let entries = Object.entries(data).filter(([, v]) => v.count != null);
    if (rarityFilter) entries = entries.filter(([, v]) => v.rarity === rarityFilter);

    const sorted = entries
      .sort((a, b) => a[1].count - b[1].count)
      .slice(0, top);

    if (!sorted.length) {
      return interaction.reply({ content: "❌ No data found for that filter.", flags: 64 });
    }

    const lines = sorted.map(([, info], i) => {
      const emoji = RARITY_EMOJIS[info.rarity] ?? "❓";
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
      return `${medal} ${emoji} **${info.name}** — \`${info.count.toLocaleString()}\` (${info.rarity})`;
    });

    const title = rarityFilter
      ? `🧠 Top ${top} Rarest — ${rarityFilter}`
      : `🧠 Top ${top} Rarest Brainrots`;

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle(title)
          .setDescription(lines.join("\n"))
          .setFooter({ text: `${meta.totalEntries || "?"} brainrots tracked • Auto-refreshes every 6h` }),
      ],
    });
  }

  // ── /membercount ─────────────────────────────────────────────────────────────
  if (commandName === "membercount") {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: "❌ Server only.", flags: 64 });

    await guild.members.fetch().catch(() => {});
    const total  = guild.memberCount;
    const bots   = guild.members.cache.filter(m => m.user.bot).size;
    const humans = total - bots;

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle(`📊 ${guild.name} — Member Count`)
          .addFields(
            { name: "👥 Total",  value: total.toLocaleString(),  inline: true },
            { name: "🧑 Humans", value: humans.toLocaleString(), inline: true },
            { name: "🤖 Bots",   value: bots.toLocaleString(),   inline: true },
          )
          .setThumbnail(guild.iconURL({ dynamic: true }))
          .setFooter({ text: `Server ID: ${guild.id}` }),
      ],
    });
  }

  // ── /ban ─────────────────────────────────────────────────────────────────────
  if (commandName === "ban") {
    const target     = interaction.options.getUser("user");
    const reason     = interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const guild      = interaction.guild;

    if (!guild) return interaction.reply({ content: "❌ Server only.", flags: 64 });
    if (!guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
      return interaction.reply({ content: "❌ I don't have Ban Members permission.", flags: 64 });
    if (target.id === interaction.user.id)
      return interaction.reply({ content: "❌ You can't ban yourself.", flags: 64 });
    if (target.id === client.user.id)
      return interaction.reply({ content: "❌ Nice try 💀", flags: 64 });

    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    if (targetMember) {
      if (targetMember.roles.highest.position >= interaction.member.roles.highest.position)
        return interaction.reply({ content: "❌ You can't ban someone with equal or higher role.", flags: 64 });
      if (targetMember.roles.highest.position >= guild.members.me.roles.highest.position)
        return interaction.reply({ content: "❌ That member has a higher role than me.", flags: 64 });
    }

    try {
      await guild.members.ban(target.id, {
        deleteMessageSeconds: deleteDays * 86400,
        reason: `Banned by ${interaction.user.tag}: ${reason}`,
      });

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("🔨 Member Banned")
        .addFields(
          { name: "User",      value: `${target.tag} (${target.id})`, inline: true },
          { name: "Banned by", value: interaction.user.tag,            inline: true },
          { name: "Reason",    value: reason },
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

      if (deleteDays > 0) embed.addFields({ name: "Messages deleted", value: `${deleteDays} day(s)` });
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      return interaction.reply({ content: `❌ Ban failed: ${err.message}`, flags: 64 });
    }
  }

  // ── /scrape ──────────────────────────────────────────────────────────────────
  if (commandName === "scrape") {
    await interaction.deferReply();
    await runScrape(client);
    const meta = loadMeta();
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("🔄 Scrape Complete")
          .addFields(
            { name: "DB Total", value: `${meta.totalEntries}`, inline: true },
            { name: "Failed",   value: `${meta.lastLog?.length ?? 0}`, inline: true },
          )
          .setTimestamp(),
      ],
    });
  }

  // ── /scrapestatus ─────────────────────────────────────────────────────────────
  if (commandName === "scrapestatus") {
    const meta = loadMeta();
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle("📡 Scrape Status")
          .addFields(
            { name: "Last Attempt", value: meta.lastScrape  ? `<t:${Math.floor(meta.lastScrape  / 1000)}:R>` : "Never", inline: true },
            { name: "Last Success", value: meta.lastSuccess ? `<t:${Math.floor(meta.lastSuccess / 1000)}:R>` : "Never", inline: true },
            { name: "DB Entries",   value: `${meta.totalEntries || 0}`,  inline: true },
            { name: "Schedule",     value: "Every 6 hours",              inline: true },
          ),
      ],
    });
  }

  // ── /update ──────────────────────────────────────────────────────────────────
  if (commandName === "update") {
    const name   = interaction.options.getString("brainrot");
    const count  = interaction.options.getInteger("count");
    const rarity = interaction.options.getString("rarity");
    const note   = interaction.options.getString("note");
    const key    = name.toLowerCase();

    const data     = loadData();
    const existing = data[key] ?? {};

    data[key] = {
      ...existing,
      name:      existing.name || name,
      count,
      rarity:    rarity ?? existing.rarity ?? guessRarity(count),
      note:      note   ?? existing.note   ?? "",
      source:    "manual",
      updatedAt: Date.now(),
    };
    saveData(data);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle("✅ Exist Count Pinned")
          .addFields(
            { name: "Brainrot", value: name,                  inline: true },
            { name: "Count",    value: count.toLocaleString(), inline: true },
            { name: "Rarity",   value: data[key].rarity,       inline: true },
          )
          .setFooter({ text: `Set by ${interaction.user.tag} • Won't be overwritten by auto-scrape` }),
      ],
    });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
(async () => {
  await registerCommands();
  await client.login(TOKEN);
})();
