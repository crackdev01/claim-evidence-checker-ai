import "dotenv/config";
import { createApp } from "./app";
import { resolveModelMode } from "./config";

const mode = resolveModelMode();
const port = Number(process.env.PORT ?? 8787);

createApp(mode).listen(port, () => {
  console.log(`Claim checker API on http://localhost:${port} (${mode.note})`);
});
