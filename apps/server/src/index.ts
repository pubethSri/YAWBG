import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3000);
const graceMs = Number(process.env.GRACE_MS ?? 120_000);
const dbPath = process.env.DB_PATH ?? "yawbg.sqlite";

const app = createApp({ graceMs, dbPath });
app.listen({ port, hostname: "0.0.0.0" });

console.log(`yawbg server listening on :${port} (grace ${graceMs}ms, db ${dbPath})`);
