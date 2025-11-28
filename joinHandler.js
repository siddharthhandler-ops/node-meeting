// joinHandler.js
import Meeting from "./meeting.js";
import { roomHost } from "./approvalHandler.js";

export function joinHandler(socket, io) {
  socket.on("join-room", async ({ roomId, name, isHost }) => {
    socket.join(roomId);

    await Meeting.findOneAndUpdate(
      { roomId },
      { $push: { users: { userId: socket.id, name } } },
      { upsert: true, new: true }
    );

    const users = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    const others = users.filter((i) => i !== socket.id);

    socket.emit("existing-users", others);

    socket.to(roomId).emit("user-joined", {
      userId: socket.id,
      name,
      isHost,
    });
  });

  socket.on("disconnecting", async () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;

      await Meeting.updateOne(
        { roomId, "users.userId": socket.id },
        { $set: { "users.$.leftAt": new Date() } }
      );

      socket.to(roomId).emit("user-left", { userId: socket.id });

      if (roomHost[roomId] === socket.id) {
        io.to(roomId).emit("host-left");
      }
    }
  });
}
