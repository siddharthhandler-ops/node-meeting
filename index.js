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

const roomHosts = {}; 
const waitingUsers = {}; 

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);


  socket.on("join-request", async ({ roomId, name, isHost }) => {
    socket.data.name = name;
 
    if (isHost) {
      roomHosts[roomId] = socket.id;
      socket.join(roomId);

      // save host join in DB
      await Meeting.findOneAndUpdate(
        { roomId },
        {
          $setOnInsert: { roomId },
          $push: { users: { userId: socket.id, name } },
        },
        { upsert: true, new: true }
      );

      socket.emit("allowed-to-join", { roomId });
      socket
        .to(roomId)
        .emit("user-joined", { userId: socket.id, name, isHost: true });
      console.log(`Host ${name} (${socket.id}) joined room ${roomId}`);
      return;
    }

    // If host present, notify host of waiting user and put user in waiting
    if (!roomHosts[roomId]) {
      // no host yet: add to waiting and notify host when/if host arrives later
      waitingUsers[roomId] = waitingUsers[roomId] || [];
      waitingUsers[roomId].push({ userId: socket.id, name });
      socket.emit("waiting-for-host");
      console.log(`User ${name} (${socket.id}) waiting for host in ${roomId}`);
      return;
    }

    // If host exists, send join request to host (host will approve/reject)
    waitingUsers[roomId] = waitingUsers[roomId] || [];
    waitingUsers[roomId].push({ userId: socket.id, name });

    // notify host about this waiting user
    io.to(roomHosts[roomId]).emit("user-waiting", { userId: socket.id, name });
    socket.emit("waiting-for-host");
    console.log(`User ${name} (${socket.id}) requested to join ${roomId}`);
  });

  // Host approves a waiting user -> server tells that specific socket they are allowed
  // payload: { roomId, userId }
  socket.on("approve-user", async ({ roomId, userId }) => {
    // send allowed event to that user
    io.to(userId).emit("allowed-to-join", { roomId });
    // remove from waitingUsers
    waitingUsers[roomId] = (waitingUsers[roomId] || []).filter(
      (u) => u.userId !== userId
    );
    console.log(`Host ${socket.id} approved ${userId} for ${roomId}`);
  });

  // Host rejects
  // payload: { roomId, userId }
  socket.on("reject-user", ({ roomId, userId }) => {
    io.to(userId).emit("rejected", { roomId });
    waitingUsers[roomId] = (waitingUsers[roomId] || []).filter(
      (u) => u.userId !== userId
    );
    console.log(`Host ${socket.id} rejected ${userId} for ${roomId}`);
  });

  // Now the actual join happens after allowed-to-join on client:
  // CLIENT emits: "join-room" { roomId, name }
  socket.on("join-room", async ({ roomId, name, isHost }) => {
    socket.data.name = name;
    socket.join(roomId);

    // if this socket had been waiting, clear waiting record
    waitingUsers[roomId] = (waitingUsers[roomId] || []).filter(
      (u) => u.userId !== socket.id
    );

    // If this user is the host, mark in roomHosts
    if (isHost) {
      roomHosts[roomId] = socket.id;
    }

    // Save join to DB
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
    socket
      .to(roomId)
      .emit("user-joined", { userId: socket.id, name, isHost: !!isHost });

    console.log(`User ${name} (${socket.id}) joined ${roomId}`);
  });

  // WebRTC signaling passthrough
  socket.on("offer", ({ to, from, sdp }) => {
    io.to(to).emit("offer", { from, sdp });
  });
  socket.on("answer", ({ to, from, sdp }) => {
    io.to(to).emit("answer", { from, sdp });
  });
  socket.on("ice-candidate", ({ to, from, candidate }) => {
    io.to(to).emit("ice-candidate", { from, candidate });
  });

  // handle disconnecting: set leftAt and notify
  socket.on("disconnecting", async () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;

      // mark leftAt in DB
      await Meeting.updateOne(
        { roomId, "users.userId": socket.id },
        { $set: { "users.$.leftAt": new Date() } }
      );

      // If host left, inform room and clear host
      if (roomHosts[roomId] === socket.id) {
        delete roomHosts[roomId];
        io.to(roomId).emit("host-left");
        console.log(`Host ${socket.id} left room ${roomId}`);
      }

      socket.to(roomId).emit("user-left", { userId: socket.id });
      console.log(`User Left: ${socket.id} from ${roomId}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

// API to fetch meeting details
app.get("/meeting/:roomId", async (req, res) => {
  const meeting = await Meeting.findOne({ roomId: req.params.roomId });
  res.json(meeting || {});
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
