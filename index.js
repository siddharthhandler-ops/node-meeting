import express from "express";
import http from "http";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Meeting from "./meeting.js";
import { Server } from "socket.io";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB Error:", err));

app.get("/", (req, res) => res.send("Socket server running with MongoDB"));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://create-meeting.vercel.app"],
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", async ({ roomId, name }) => {
    socket.data.name = name;
    socket.join(roomId);

    await Meeting.findOneAndUpdate(
      { roomId },
      {
        $setOnInsert: { roomId },
        $push: { users: { userId: socket.id, name } },
      },
      { upsert: true, new: true }
    );

    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    const otherClients = clients.filter((id) => id !== socket.id);

    socket.emit("existing-users", otherClients);
    socket.to(roomId).emit("user-joined", { userId: socket.id, name });

    console.log(`User ${name} (${socket.id}) joined ${roomId}`);
  });

  socket.on("offer", ({ to, from, sdp }) => {
    io.to(to).emit("offer", { from, sdp });
  });

  socket.on("answer", ({ to, from, sdp }) => {
    io.to(to).emit("answer", { from, sdp });
  });

  socket.on("ice-candidate", ({ to, from, candidate }) => {
    io.to(to).emit("ice-candidate", { from, candidate });
  });

  socket.on("disconnecting", async () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;

      await Meeting.updateOne(
        { roomId, "users.userId": socket.id },
        { $set: { "users.$.leftAt": new Date() } }
      );

      socket.to(roomId).emit("user-left", { userId: socket.id });
      console.log(`User Left: ${socket.id}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

app.get("/meeting/:roomId", async (req, res) => {
  const meeting = await Meeting.findOne({ roomId: req.params.roomId });
  res.json(meeting || {});
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
