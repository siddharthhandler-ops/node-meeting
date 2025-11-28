// signallingHandler.js
export function signalingHandler(socket, io) {
  socket.on("offer", (d) => io.to(d.to).emit("offer", d));
  socket.on("answer", (d) => io.to(d.to).emit("answer", d));
  socket.on("ice-candidate", (d) => io.to(d.to).emit("ice-candidate", d));
}
