import mongoose from "mongoose";

const registrationSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: function (value) {
          return value > 0;
        },
        message: "Amount must be greater than 0",
      },
    },
    currency: {
      type: String,
      required: true,
    },
    receipt: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      required: true,
    },
    id: {
      type: String,
      required: true,
    },
    // NEW FIELDS FOR PRICING BREAKDOWN
    baseAmount: {
      type: Number,
      required: true,
    },
    finalAmount: {
      type: Number,
      required: true,
    },
    hasMembership: {
      type: Boolean,
      default: false,
    },
    membershipFee: {
      type: Number,
      default: 0,
    },
    couponCode: {
      type: String,
      default: null,
      uppercase: true,
    },
    couponDiscount: {
      type: Number,
      default: 0,
    },
    membershipDiscount: {
      type: Number,
      default: 0,
    },
    FormData: {
      Title: {
        type: String,
        required: true,
      },
      first_name: {
        type: String,
        required: true,
      },
      last_name: {
        type: String,
        required: true,
      },
      certificate_name: {
        type: String,
        required: true,
      },
      DOB: {
        type: Date,
        required: true,
        validate: {
          validator: function (value) {
            return value <= new Date();
          },
          message: "Date of Birth cannot be in the future",
        },
      },
      nationality: {
        type: String,
        required: true,
      },
      department: {
        type: String,
        required: true,
      },
      institution: {
        type: String,
        required: true,
      },
      number: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
        match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
      },
      participant_category: {
        type: String,
        required: true,
        enum: ["Academicians", "Delegates", "Research scholars", "Student"],
      },
      presentation_Category: {
        type: String,
        required: true,
        enum: ["oral", "poster"],
      },
      presentation_Type: {
        type: String,
        required: true,
        enum: ["Virtual", "Physical"],
      },
    },
  },
  { timestamps: true }
);

const Registration = mongoose.model("Registration", registrationSchema);

export default Registration;
