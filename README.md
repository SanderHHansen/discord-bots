# OmarBot, AkuBot og KennyBot

Tre enkle Discord-boter som kjører fra samme prosjekt.

- **OmarBot** – svarer (dårlig) på spørsmål via Groq.
- **AkuBot** – en konspiratorisk, negativ bot ("Jason D. Maine") som svarer på engelsk via Groq.
- **KennyBot** – reagerer med ❤️ og skriver "jeg joiner" når noen tagger `@Scamvengers`-rollen. Bruker **ingen** LLM.

## Slik bruker du dem

OmarBot svarer når du tagger den eller bruker prefikset:

```
@OmarBot hvorfor er himmelen blå?
OmarBot Explain: hvorfor er himmelen blå?
```

AkuBot svarer på samme måte (tag eller prefiks), alltid på engelsk:

```
@AkuBot what do you think about bread?
AkuBot what do you think about bread?
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
   - `AKU_DISCORD_TOKEN` – AkuBot
   - `KENNY_DISCORD_TOKEN` – KennyBot
   - Lag botene på https://discord.com/developers/applications
   - `GROQ_API_KEY` – gratis nøkkel fra https://console.groq.com/keys (deles av OmarBot og AkuBot)
3. **Viktig:** aktiver `MESSAGE CONTENT INTENT` under *Bot* på Discord Developer Portal for hver bot.
4. Inviter hver bot til serveren (scope: `bot`, rettigheter: *Send Messages* + *Read Message History* + *Add Reactions*).

Merk for KennyBot: rollen `Scamvengers` må være **mentionable** (Role → "Allow anyone to @mention this role").

## Kjør

```
npm start
```

Boter uten token i `.env` hoppes bare over med en advarsel.

## Automatiske innlegg

AkuBot kan poste en konspirasjonsteori helt av seg selv noen ganger i uken. Sett `scheduledPost` på boten i `bots.js`:

```js
scheduledPost: {
  channelName: "akuchannel",
  minHour: 2,
  maxHour: 6,
  postsPerWeek: 2,
  timeZone: "Europe/Oslo",
},
```

Boten velger tilfeldige dager og klokkeslett innenfor `minHour`–`maxHour` (i `timeZone`) og poster `postsPerWeek` ganger per uke. Kanalen må være synlig for boten. Fjern `scheduledPost` for å skru det av.

## Kjente Discord-brukere

`KNOWN_USERS` i `bots.js` deles av alle LLM-botene, slik at de vet hvem de ulike brukernavnene er (f.eks. `cake10` = Sander). Alle meldinger prefikses med avsenderens brukernavn, så botene ser hvem som skriver. Personlige forhold (hvem en bot liker/misliker) ligger i den enkelte bots `systemPrompt`.

## Legge til en ny bot

Legg til en ny oppføring i `bots.js`:

- `mode: "llm"` – som OmarBot: krever `name`, `tokenEnv`, `prefix`, `systemPrompt` og valgfritt `model` / `variationHints` / `norwegianChance`.
- `mode: "roleReact"` – som KennyBot: krever `name`, `tokenEnv`, `roleName`, `reaction`, `reply`.

`norwegianChance` (0–1) lar en bot som normalt svarer på et annet språk av og til svare på norsk bokmål i stedet. AkuBot bruker `0.1`, altså ca. 1 av 10 svar.

Legg så til token-variabelen i `.env`.

## Filer

- `index.js` – starter alle botene
- `bot.js` – delt logikk (Discord + Groq)
- `bots.js` – config for hver bot (navn, token, prefiks, persona)
- `.env` – hemmelige nøkler (ikke del eller commit)
