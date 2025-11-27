import { Server } from "socket.io";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://create-meeting.vercel.app"],
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("check-role", (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    socket.emit("role", room ? "guest" : "host");
  });

  socket.on("request-join", ({ roomId, name }) => {
    socket.to(roomId).emit("join-request", { id: socket.id, name });
  });

  socket.on("approve-user", ({ roomId, userId }) => {
    io.to(userId).emit("approved");
  });

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", socket.id);
  });
});

server.listen(4000, () => console.log("Socket server running on port 4000"));
