import mongoose from "mongoose";

const { Schema } = mongoose;

const fileSchema = new Schema({
  originalname: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  buffer: { type: Buffer, required: true },
});

const paperSubmissionSchema = new Schema(
  {
    Submission_type: { type: String, required: true },
    paper_title: { type: String, required: true },
    WhoWillPresent: {
      type: String,
      required: true,
    },
    authorName: { type: String, required: true },
    CoAuthorName: { type: String, required: true },
    correspondingEmail: {
      type: String,
      required: true,
      validate: {
        validator: (v) => /.+\@.+\..+/.test(v),
        message: (props) => `${props.value} is not a valid email!`,
      },
    },
    mobileNumber: { type: String, required: true },
    whatsappNumber: { type: String, required: true },
    linkedinURL: { type: String, required: false },
    facebookURL: { type: String, required: false },
    presentationCategory: { type: String, required: true },
    presentationType: { type: String, required: true },
    Institution_Name: { type: String, required: true },
    Department: { type: String, required: true },
    designation: { type: String, required: true },
    Publication_Required: { type: String, required: true },
    conferenceSource: { type: String, required: true },
    message: { type: String, required: false },
    Uploaded_File: { type: fileSchema, required: true },
    SubmissionID: { type: String, required: true },
  },
  { timestamps: true }
);

const PaperSubmission = mongoose.model(
  "PaperSubmission",
  paperSubmissionSchema
);

export default PaperSubmission;
