import mongoose from "mongoose";

const SpeakerSchema = new mongoose.Schema(
  {
    Name: {
      type: String,
      required: true,
    },
    Title: {
      type: String,
      required: true,
    },
    About_1: {
      type: String,
    },
    About_2: {
      type: String,
    },
    About_3: {
      type: String,
    },
    About_4: {
      type: String,
    },
    Image: {
      type: Object,
    },
    position: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

const Speaker = mongoose.model("Speaker", SpeakerSchema);
export default Speaker;
