const roomHost = {};
const waitingUsers = {};

export function approvalHandler(socket, io) {
  socket.on("join-meeting", async ({ roomId, name, isHost }) => {
    socket.data.name = name;

    if (isHost) {
      roomHost[roomId] = socket.id;

      const meetingExists = await Meeting.findOne({ roomId });
      if (!meetingExists) await Meeting.create({ roomId });

      socket.emit("allowed-to-join");
      return;
    }

    waitingUsers[roomId] = waitingUsers[roomId] || [];

    if (!roomHost[roomId]) {
      waitingUsers[roomId].push({ userId: socket.id, name });
      socket.emit("waiting-for-host");
      return;
    }

    waitingUsers[roomId].push({ userId: socket.id, name });

    io.to(roomHost[roomId]).emit("user-waiting", {
      userId: socket.id,
      name,
    });

    socket.emit("waiting-for-host");
  });

  socket.on("approve-user", ({ roomId, userId }) => {
    io.to(userId).emit("allowed-to-join");
    waitingUsers[roomId] = waitingUsers[roomId].filter(
      (u) => u.userId !== userId
    );
  });

  socket.on("reject-user", ({ roomId, userId }) => {
    io.to(userId).emit("rejected");
    waitingUsers[roomId] = waitingUsers[roomId].filter(
      (u) => u.userId !== userId
    );
  });
}

export { roomHost };
