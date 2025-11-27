import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  userId: String,
  name: String,
  joinedAt: { type: Date, default: Date.now },
  leftAt: Date,
});

const meetingSchema = new mongoose.Schema({
  roomId: String,
  createdAt: { type: Date, default: Date.now },
  users: [userSchema],
});

export default mongoose.models.Meeting ||
  mongoose.model("Meeting", meetingSchema);
