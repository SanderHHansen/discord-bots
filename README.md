# OmarBot og KennyBot

To enkle Discord-boter som kjører fra samme prosjekt.

- **OmarBot** – svarer (dårlig) på spørsmål via Groq.
- **KennyBot** – reagerer med ❤️ og skriver "jeg joiner" når noen tagger `@Scamvengers`-rollen. Bruker **ingen** LLM.

## Slik bruker du dem

OmarBot svarer når du tagger den eller bruker prefikset:

```
@OmarBot hvorfor er himmelen blå?
OmarBot Explain: hvorfor er himmelen blå?
```

KennyBot reagerer kun på rolle-tagg:

```
@Scamvengers ...
```

## Oppsett

1. Installer avhengigheter:
   ```
   npm install
   ```
2. Kopier `.env.example` til `.env` og fyll inn en bot-token per bot:
   - `DISCORD_TOKEN` – OmarBot
   - `KENNY_DISCORD_TOKEN` – KennyBot
   - Lag botene på https://discord.com/developers/applications
   - `GROQ_API_KEY` – gratis nøkkel fra https://console.groq.com/keys (kun OmarBot trenger denne)
3. **Viktig:** aktiver `MESSAGE CONTENT INTENT` under *Bot* på Discord Developer Portal for hver bot.
4. Inviter hver bot til serveren (scope: `bot`, rettigheter: *Send Messages* + *Read Message History* + *Add Reactions*).

Merk for KennyBot: rollen `Scamvengers` må være **mentionable** (Role → "Allow anyone to @mention this role").

## Kjør

```
npm start
```

Boter uten token i `.env` hoppes bare over med en advarsel.

## Legge til en ny bot

Legg til en ny oppføring i `bots.js`:

- `mode: "llm"` – som OmarBot: krever `name`, `tokenEnv`, `prefix`, `systemPrompt` og valgfritt `model` / `variationHints`.
- `mode: "roleReact"` – som KennyBot: krever `name`, `tokenEnv`, `roleName`, `reaction`, `reply`.

Legg så til token-variabelen i `.env`.

## Filer

- `index.js` – starter alle botene
- `bot.js` – delt logikk (Discord + Groq)
- `bots.js` – config for hver bot (navn, token, prefiks, persona)
- `.env` – hemmelige nøkler (ikke del eller commit)
