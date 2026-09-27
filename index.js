import "dotenv/config";
import { bots } from "./bots.js";
import { startBot } from "./bot.js";

const started = bots.map(startBot).filter(Boolean);

if (started.length === 0) {
  console.error("Ingen boter kunne startes – sjekk token-variablene i .env");
  process.exit(1);
}
