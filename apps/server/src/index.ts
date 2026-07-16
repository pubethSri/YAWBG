import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3000);
const graceMs = Number(process.env.GRACE_MS ?? 120_000);

const app = createApp({ graceMs });
app.listen({ port, hostname: "0.0.0.0" });

console.log(`yawbg server listening on :${port} (grace ${graceMs}ms)`);
