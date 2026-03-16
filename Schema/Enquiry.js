import mongoose, { Mongoose } from "mongoose";

const EnquirySchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      match: /.+\@.+\..+/,
    },
    phone: {
      type: String,
      required: true,
    },
    contact_method: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    referral: {
      type: String,
      required: true,
    },
    contact_time: {
      type: String,
      enum: ["morning", "afternoon", "evening"],
      required: true,
    },
  },
  { timestamps: true }
);

const Enquiry = mongoose.model("Enquiry", EnquirySchema);

export default Enquiry;
