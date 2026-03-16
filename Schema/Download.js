import mongoose from "mongoose";

const DownloadSchema = new mongoose.Schema(
  {
    Email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    Info: {
      type: String,
      required: true,
    },
    Link: {
      type: String,
      required: true,
    },
    Name: {
      type: String,
      required: true,
    },
    Number: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
); 

const Download = mongoose.model("Download", DownloadSchema);

export default Download;
