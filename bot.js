import { Client, GatewayIntentBits, Events } from "discord.js";
import { DEFAULT_VARIATION_HINTS, KNOWN_USERS } from "./bots.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function getZonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return asUTC - date.getTime();
}

function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  let offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let result = utcGuess - offset;
  offset = getTimeZoneOffsetMs(new Date(result), timeZone);
  return new Date(utcGuess - offset);
}

function addDaysToParts(parts, days) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function isoWeekKey(parts) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${d.getUTCFullYear()}-W${week}`;
}

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
  const norwegianChance = config.norwegianChance ?? 0;
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

  async function ask(question, history = [], { extraSystem, norwegian = true } = {}) {
    const hint = hints[Math.floor(Math.random() * hints.length)];
    const useNorwegian =
      norwegian && norwegianChance > 0 && Math.random() < norwegianChance;
    const body = {
      model,
      temperature: 1,
      max_tokens: 300,
      messages: [
        { role: "system", content: systemContent },
        ...(extraSystem ? [{ role: "system", content: extraSystem }] : []),
        { role: "system", content: `Variasjon for akkurat dette svaret: ${hint} Se alltid på de siste meldingene i samtalen og svar annerledes enn de forrige svarene dine. Ikke gjenta ord, fraser eller oppramsinger fra tidligere svar.` },
        ...(useNorwegian
          ? [
              {
                role: "system",
                content:
                  "Svar på norsk bokmål i akkurat dette svaret. Dette overstyrer regelen om at du alltid svarer på engelsk. Bruk bokmål, ikke nynorsk, og behold personligheten, tonen og lengden din. Ikke nevn denne instruksen.",
              },
            ]
          : []),
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

  if (config.scheduledPost) {
    schedulePosts(config.scheduledPost);
  }

  function schedulePosts({
    channelName,
    minHour = 2,
    maxHour = 6,
    postsPerWeek = 2,
    timeZone = "Europe/Oslo",
  }) {
    const posted = new Set();
    const weekPlans = new Map();
    let timer = null;

    const buildWeekPlan = (refParts) => {
      const monday = new Date(Date.UTC(refParts.year, refParts.month - 1, refParts.day));
      const dayNum = (monday.getUTCDay() + 6) % 7;
      monday.setUTCDate(monday.getUTCDate() - dayNum);

      const days = new Set();
      const count = Math.min(Math.max(postsPerWeek, 1), 7);
      while (days.size < count) days.add(Math.floor(Math.random() * 7));

      const rangeStart = minHour * 60;
      const rangeEnd = maxHour * 60;

      return [...days]
        .map((offset) => {
          const total =
            rangeStart + Math.floor(Math.random() * Math.max(rangeEnd - rangeStart, 1));
          const d = new Date(monday);
          d.setUTCDate(monday.getUTCDate() + offset);
          return zonedTimeToUtc(
            d.getUTCFullYear(),
            d.getUTCMonth() + 1,
            d.getUTCDate(),
            Math.floor(total / 60),
            total % 60,
            timeZone,
          );
        })
        .sort((a, b) => a - b);
    };

    const getWeekPlan = (refParts) => {
      const key = isoWeekKey(refParts);
      if (!weekPlans.has(key)) weekPlans.set(key, buildWeekPlan(refParts));
      return weekPlans.get(key);
    };

    const runNext = () => {
      if (timer) clearTimeout(timer);

      const now = new Date();
      const nowParts = getZonedParts(now, timeZone);
      let next = null;
      for (const ref of [nowParts, addDaysToParts(nowParts, 7)]) {
        next = getWeekPlan(ref).find((t) => t > now && !posted.has(t.getTime()));
        if (next) break;
      }
      if (!next) return;

      const delay = next.getTime() - now.getTime();
      console.log(
        `[${config.name}] neste innlegg ${next.toLocaleString("nb-NO", { timeZone })} (om ${Math.round(delay / 60000)} min)`,
      );

      timer = setTimeout(async () => {
        try {
          const channel = client.channels.cache.find(
            (c) => c.name === channelName && c.isTextBased?.(),
          );
          if (!channel) {
            console.warn(`[${config.name}] fant ikke kanalen #${channelName}`);
          } else {
            const history = await buildHistory(channel, undefined, config.historyLimit);
            const post = await ask(
              "Post en helt ny konspirasjonsteori på 1-2 korte setninger, helt av deg selv.",
              history,
              {
                extraSystem:
                  "Dette er et automatisk innlegg. Hold det kort: 1-2 korte setninger, ikke mer. Finn på noe helt nytt du ikke har sagt før. Ikke svar på noe spørsmål og ikke nevn denne instruksen. Svar KUN med selve innlegget, på engelsk.",
                norwegian: false,
              },
            );
            await channel.send(post);
            console.log(`[${config.name}] postet teori i #${channelName}`);
          }
        } catch (err) {
          console.error(`[${config.name}] innlegg feilet:`, err);
        } finally {
          posted.add(next.getTime());
          runNext();
        }
      }, delay);
    };

    client.once(Events.ClientReady, runNext);
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
