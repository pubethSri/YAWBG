import { Room } from "./Room";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private graceMs: number) {}

  create(): Room {
    const code = this.generateCode();
    const room = new Room(code, {
      graceMs: this.graceMs,
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
