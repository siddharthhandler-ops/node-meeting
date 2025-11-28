const roomHost = {};
const waitingUsers = {};

export function approvalHandler(socket, io) {
  socket.on("join-meeting", async ({ roomId, name, isHost }) => {
    socket.data.name = name;

    // HOST enters
    if (isHost) {
      roomHost[roomId] = socket.id;

      const meetingExists = await Meeting.findOne({ roomId });
      if (!meetingExists) await Meeting.create({ roomId });

      socket.emit("allowed-to-join");

      // Auto-approve waiting guests
      if (waitingUsers[roomId]) {
        waitingUsers[roomId].forEach((u) => {
          io.to(u.userId).emit("allowed-to-join");
        });
        waitingUsers[roomId] = [];
      }

      return;
    }

    // GUEST enters
    waitingUsers[roomId] = waitingUsers[roomId] || [];

    // Host NOT present → guest waits
    if (!roomHost[roomId]) {
      waitingUsers[roomId].push({ userId: socket.id, name });
      socket.emit("waiting-for-host");
      return;
    }

    // Host IS present → ask HOST for approval
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
