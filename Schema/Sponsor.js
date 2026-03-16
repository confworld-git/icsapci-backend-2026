import mongoose from 'mongoose';

const sponsorSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, "Full name is required"],
    trim: true,
    minlength: [2, "Name must be at least 2 characters long"],
    maxlength: [100, "Name cannot exceed 100 characters"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    lowercase: true,
    trim: true,
    match: [/.+@.+\..+/, "Please enter a valid email address"],
  },
  organization: {
    type: String,
    required: [true, "Organization is required"],
    trim: true,
  },
  designation: {
    type: String,
    required: [true, "Designation is required"],
    trim: true,
  },
  address: {
    type: String,
    required: [true, "Address is required"],
    trim: true,
  },
  city: {
    type: String,
    required: [true, "City is required"],
    trim: true,
  },
  state: {
    type: String,
    required: [true, "State is required"],
    trim: true,
  },
  zipCode: {
    type: Number, // better than Number to preserve leading zeros
    required: [true, "Zip code is required"],
    match: [/^\d{4,10}$/, "Zip code must be between 4 and 10 digits"],
  },
  country: {
    type: String,
    required: [true, "Country is required"],
    trim: true,
  },
  phone: {
    type: String, // better as String to allow +, -, and leading 0
    required: [true, "Phone number is required"],
    match: [/^\+?[0-9]{7,15}$/, "Please enter a valid phone number"],
  },
  sponsorshipType: {
  type: String,
  required: true,
  trim: true,
},
sponsorshipPrice: {
  type: String,
  required: true,
  trim: true,
},
  
}); // adds createdAt & updatedAt automatically

export default mongoose.model('Sponsor', sponsorSchema);
