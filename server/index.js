import express from "express";
import logger from "morgan";
import { Server } from "socket.io";
import { createServer } from "node:http";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

dotenv.config();

const port = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {}
});

const db = createClient({
  url: "libsql://ideal-klaw-jeissonhrdz.turso.io",
  authToken: process.env.DB_TOKEN
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    username TEXT
  );`);

io.on("connection", async (socket) => {
  console.log("New client connected");

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });

  socket.on("Chat message", async (msg) => {
    let result;
    const username = socket.handshake.auth.user ?? "Anonymous";
    try {
      result = await db.execute({
        sql: "INSERT INTO messages (message, username) VALUES (:msg, :username)",
        args: { msg, username }
      });
    } catch (e) {
      console.error(e);
      return;
    }
    io.emit("Chat message", msg, result.lastInsertRowid.toString(), username);
  });

  if (!socket.recovered) {
    try {
      const result = await db.execute({
        sql: "SELECT id, message, username FROM messages WHERE id > ?",
        args: [socket.handshake.auth.serverOffset ?? 0]
      });

      result.rows.forEach((row) => {
        socket.emit("Chat message", row.message, row.id.toString(), row.username);
      });

    } catch (e) {
      console.error(e);
      return;
    }
  }
});

app.use(logger("dev"));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
