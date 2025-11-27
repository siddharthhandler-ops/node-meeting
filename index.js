import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();

app.use(cors());
app.get("/", (req, res) => {
  res.send("Socket server is running ");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "https://create-meeting.vercel.app"],
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, name }) => {
    socket.data.name = name;
    socket.join(roomId);

    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    const otherClients = clients.filter((id) => id !== socket.id);
    socket.emit("existing-users", otherClients);

    socket.to(roomId).emit("user-joined", {
      userId: socket.id,
      name,
    });

    console.log(`User ${socket.id} joined room ${roomId}`);
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

  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      socket.to(roomId).emit("user-left", { userId: socket.id });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});
