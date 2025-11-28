// index.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import cors from "cors";
import mongoose from "mongoose";
import { Server } from "socket.io";

import Meeting from "./meeting.js";
import { approvalHandler } from "./approvalHandler.js";
import { joinHandler } from "./joinHandler.js";
import { signalingHandler } from "./signalingHandler.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected");

    io.on("connection", (socket) => {
      console.log("User connected:", socket.id);
      approvalHandler(socket, io);
      joinHandler(socket, io);
      signalingHandler(socket, io);
    });

    app.get("/meeting/:roomId", async (req, res) => {
      const meeting = await Meeting.findOne({ roomId: req.params.roomId });
      res.json(meeting || {});
    });

    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("MongoDB Connection Failed:", err);
    process.exit(1);
  }
}

startServer();
