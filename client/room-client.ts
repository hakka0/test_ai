export interface PlayRoom {
  sessionId: string;
  reconnectionToken: string;
  connection: { isOpen: boolean; close(): void };
  onMessage(type: string, callback: (data: any) => void): unknown;
  onLeave(callback: (code: number) => void): unknown;
  onError(callback: (code: number, message?: string) => void): unknown;
  send(type: string, data: unknown): void;
  leave(): Promise<unknown>;
}
export interface RoomClient {
  create(name: string, options: {name: string; practice: boolean; botPractice?: boolean; roster?: string}): Promise<PlayRoom>;
  joinById(code: string, options: {name: string}): Promise<PlayRoom>;
  reconnect(token: string): Promise<PlayRoom>;
}
