import mongoose from "mongoose";

const { Schema } = mongoose;

const ocmSchemaFile = new Schema({
  originalname: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  buffer: { type: Buffer, required: true },
});

const ocmSchema = new Schema(
  {
    Title: { type: String, required: true },
    First_Name: { type: String, required: true },
    Email: { type: String, required: true },
    Number: { type: String, required: true },
    Member_Category: { type: String, required: true },
    Organization: { type: String, required: true },
    Qualification: { type: String, required: true },
    Professional_Experience: { type: String, required: true },
    Industry_Experience: { type: String, required: true },
    Department: { type: String, required: true },
    Specialization: { type: String, required: true },
    h_index: { type: String, required: true },
    Country: { type: String, required: true },
    Associated_Cerada: { type: String, required: true },
    Publication: { type: String, required: true },
    SCI_Published: { type: String, required: true },
    Journals: { type: String, required: true },
    Conference_Info: { type: String, required: true },
    Uploaded_File: { type: ocmSchemaFile, required: true },
  },
  { timestamps: true }
);

const Committee = mongoose.model("Committee", ocmSchema);

export default Committee;
