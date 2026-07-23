import type { TopicSource } from "./DeckStore";
import { Room } from "./Room";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface RoomOptions {
  graceMs: number;
  decks: TopicSource;
  distributeMs?: number;
  drawMs?: number;
  roundTimerMsPerSec?: number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private opts: RoomOptions) {}

  create(): Room {
    const code = this.generateCode();
    const room = new Room(code, {
      ...this.opts,
      onEmpty: () => this.rooms.delete(code),
    });
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  private generateCode(): string {
    let code: string;
    do {
      code = Array.from(
        { length: 4 },
        () => LETTERS[Math.floor(Math.random() * LETTERS.length)],
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }
}
