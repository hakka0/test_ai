import express from "express";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";
const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use(express.static(resolve("dist")));
const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    maxPayload: 16 * 1024,
  }),
  greet: false,
});
gameServer.define("duel", GameRoom);
const port = Number(process.env.PORT || 2567);
await gameServer.listen(port, "0.0.0.0");
console.log(
  `Game server: http://localhost:${port} (LAN: http://YOUR_PC_IP:${port})`,
);
