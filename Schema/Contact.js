import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    Email: {
      type: String,
      required: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    First_Name: {
      type: String,
      required: true,
    },
    Second_Name: {
      type: String,
      required: false,
    },
    Mobile_Number: {
      type: String,
      required: true,
    },
    Message: {
      type: String,
      required: true,
    },
  },
  { timestamps: true } 
);

const Contact = mongoose.model("Contact", contactSchema);

export default Contact;
