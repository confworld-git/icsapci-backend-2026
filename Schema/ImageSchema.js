import mongoose from "mongoose";

const ImageSchema = new mongoose.Schema({
  originalname: { type: String, required: true },
  mimetype: { type: String, required: true },
  data: { type: Buffer, required: true },
  size: { type: Number, required: true },
});

const Image = mongoose.model("Image", ImageSchema);
export default Image;
