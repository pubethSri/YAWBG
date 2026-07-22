import { expect } from "bun:test";
import { ServerMessageSchema, type ClientIntent, type ServerMessage, type Topic } from "@yawbg/protocol";
import type { TopicSource } from "../src/DeckStore";

/**
 * A deck that needs no SQLite. Pass it as createApp({ decks: fakeDeck(n) }) so
 * the tests never open a database file.
 */
export function fakeDeck(count = 5): TopicSource {
  const topics: Topic[] = Array.from({ length: count }, (_, i) => ({
    id: `t-${i + 1}`,
    text: `Topic ${i + 1}`,
  }));
  return {
    topicsFor: () => topics.slice(),
    has: () => true,
  };
}

export class TestClient {
  private queue: ServerMessage[] = [];
  private waiters: ((m: ServerMessage) => void)[] = [];

  private constructor(readonly ws: WebSocket) {}

  static async connect(port: number): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const client = new TestClient(ws);
    ws.onmessage = (e) => {
      const msg = ServerMessageSchema.parse(JSON.parse(String(e.data)));
      const waiter = client.waiters.shift();
      if (waiter) waiter(msg);
      else client.queue.push(msg);
    };
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
    });
    return client;
  }

  send(intent: ClientIntent) {
    this.ws.send(JSON.stringify(intent));
  }

  sendRaw(data: string) {
    this.ws.send(data);
  }

  next(timeoutMs = 2000): Promise<ServerMessage> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
      this.waiters.push((m) => {
        clearTimeout(timer);
        resolve(m);
      });
    });
  }

  // Player sockets get a player.board frame alongside every room.state (per
  // notifyAll); these helpers drain past any of the "other" frame type so
  // assertions don't care how many stray board/state frames piled up.
  private async nextSkipping(skipType: ServerMessage["type"]): Promise<ServerMessage> {
    let msg = await this.next();
    while (msg.type === skipType) msg = await this.next();
    return msg;
  }

  async expectState(): Promise<Extract<ServerMessage, { type: "room.state" }>["payload"]> {
    const msg = await this.nextSkipping("player.board");
    expect(msg.type).toBe("room.state");
    if (msg.type !== "room.state") throw new Error("unreachable");
    return msg.payload;
  }

  async expectPlayerBoard(): Promise<Extract<ServerMessage, { type: "player.board" }>["payload"]> {
    const msg = await this.nextSkipping("room.state");
    expect(msg.type).toBe("player.board");
    if (msg.type !== "player.board") throw new Error("unreachable");
    return msg.payload;
  }

  async expectError(code: string): Promise<void> {
    const msg = await this.nextSkipping("player.board");
    expect(msg).toMatchObject({ type: "error", payload: { code } });
  }

  close() {
    this.ws.close();
  }
}
