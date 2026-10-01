import { Client, GatewayIntentBits, Events } from "discord.js";
import { DEFAULT_VARIATION_HINTS, KNOWN_USERS } from "./bots.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export function startBot(config) {
  if (config.mode === "roleReact") return startRoleReactBot(config);
  return startLlmBot(config);
}

function startLlmBot(config) {
  const token = process.env[config.tokenEnv];
  if (!token) {
    console.warn(`[${config.name}] hopper over: mangler ${config.tokenEnv} i .env`);
    return null;
  }
  if (!process.env.GROQ_API_KEY) {
    console.warn(`[${config.name}] hopper over: mangler GROQ_API_KEY i .env`);
    return null;
  }

  const model = config.model || "openai/gpt-oss-20b";
  const hints = config.variationHints?.length ? config.variationHints : DEFAULT_VARIATION_HINTS;
  const prefix = config.prefix.toLowerCase();
  const includeAuthor = config.includeAuthor ?? true;
  const knownUsers = KNOWN_USERS.length
    ? `Known Discord users (messages are prefixed with the sender's username):\n${KNOWN_USERS.map(
        (u) => `- "${u.username}" is ${u.realName}.`,
      ).join("\n")}`
    : "";
  const systemContent = [config.systemPrompt, knownUsers].filter(Boolean).join("\n\n");

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    presence: { status: config.status || "online" },
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`${config.name} er online som ${c.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!client.user) return;

    const content = message.content.trim();
    const lower = content.toLowerCase();
    const mentioned = message.mentions.has(client.user);

    let question;
    if (mentioned) {
      const mentionRegex = new RegExp(`<@!?${client.user.id}>`, "g");
      question = content.replace(mentionRegex, "").trim();
      if (question.toLowerCase().startsWith("explain:")) {
        question = question.slice("explain:".length).trim();
      }
      if (question.toLowerCase().startsWith(prefix)) {
        question = question.slice(prefix.length).trim();
      }
    } else if (lower.startsWith(prefix)) {
      question = content.slice(prefix.length).trim();
    } else {
      return;
    }

    if (!question) {
      await message.reply(config.emptyReply);
      return;
    }

    try {
      await message.channel.sendTyping();
      const history = await buildHistory(message.channel, message.id, config.historyLimit);
      const prompt = includeAuthor ? `${message.author.username}: ${question}` : question;
      const answer = await ask(prompt, history);
      await message.reply(answer);
    } catch (err) {
      console.error(`[${config.name}] Feil:`, err);
      await message.reply(config.errorReply);
    }
  });

  async function buildHistory(channel, currentId, limit = 10) {
    try {
      const fetched = await channel.messages.fetch({ limit: Math.max(limit * 3, 30), before: currentId });
      const ordered = [...fetched.values()].reverse();
      const history = [];
      for (const m of ordered) {
        const text = m.content?.trim();
        if (!text) continue;
        const isSelf = m.author.id === client.user.id;
        history.push({
          role: isSelf ? "assistant" : "user",
          content: (includeAuthor && !isSelf ? `${m.author.username}: ` : "") + text.slice(0, 400),
        });
      }
      return history.slice(-limit);
    } catch (err) {
      console.error(`[${config.name}] kunne ikke hente historikk:`, err);
      return [];
    }
  }

  async function ask(question, history = []) {
    const hint = hints[Math.floor(Math.random() * hints.length)];
    const body = {
      model,
      temperature: 1,
      max_tokens: 300,
      messages: [
        { role: "system", content: systemContent },
        { role: "system", content: `Variasjon for akkurat dette svaret: ${hint} Se alltid på de siste meldingene i samtalen og svar annerledes enn de forrige svarene dine. Ikke gjenta ord, fraser eller oppramsinger fra tidligere svar.` },
        ...history,
        { role: "user", content: question },
      ],
    };

    if (model.startsWith("openai/gpt-oss")) {
      body.reasoning_effort = "low";
    }

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Groq svarte ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || "jeg vet svaret men jeg gidder ikke og forklare det for han";
  }

  client.login(token).catch((err) => {
    console.error(`[${config.name}] kunne ikke logge inn:`, err.message);
  });

  return client;
}

function startRoleReactBot(config) {
  const token = process.env[config.tokenEnv];
  if (!token) {
    console.warn(`[${config.name}] hopper over: mangler ${config.tokenEnv} i .env`);
    return null;
  }

  const roleName = config.roleName?.toLowerCase();
  if (!roleName) {
    console.warn(`[${config.name}] hopper over: mangler roleName`);
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    presence: { status: config.status || "online" },
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`${config.name} er online som ${c.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const tagged = message.mentions.roles.some((role) => role.name.toLowerCase() === roleName);
    if (!tagged) return;

    try {
      await message.react(config.reaction || "❤️");
      await message.reply(config.reply || "jeg joiner");
    } catch (err) {
      console.error(`[${config.name}] Feil:`, err);
    }
  });

  client.login(token).catch((err) => {
    console.error(`[${config.name}] kunne ikke logge inn:`, err.message);
  });

  return client;
}
