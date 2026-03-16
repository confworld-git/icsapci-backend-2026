import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import multer from "multer";
import crypto from "crypto";
import nodemailer from "nodemailer";
import Razorpay from "razorpay";

import Registration from "./Schema/RegisterSchema.js";
import Contact from "./Schema/Contact.js";
import Download from "./Schema/Download.js";
import Committee from "./Schema/ocm.js";
import Payment from "./Schema/Payment.js";
import PaperSubmission from "./Schema/Submission.js";
import Enquiry from "./Schema/Enquiry.js";
import Image from "./Schema/ImageSchema.js";
import Speaker from "./Schema/SpeakerSchema.js";
import Sponsor from "./Schema/Sponsor.js";
import Coupon from "./Schema/CouponSchema.js";

dotenv.config();
const app = express();
const allowedOrigins = [
  "http://localhost:5173",
  "https://backendicsap.confworld.org",
  "https://icsap.co.in",
  "http://icsap.co.in" // Add HTTP version too
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin); // Debug log
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200 // For legacy browser support
}));

// Add explicit OPTIONS handler for preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
  res.header('Access-Control-Allow-Credentials', true);
  res.sendStatus(200);
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const mongoURI = process.env.MONGO_URI;
mongoose
  .connect(mongoURI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

app.get("/Dashboard/Data/All", async (req, res) => {
  try {
    const paidRegistrations = await Registration.find({
      status: "Payment Paid",
    });
    const totalFee = paidRegistrations.reduce((sum, registration) => {
      return sum + (registration.selectedFee || 0);
    }, 0);
    const contactData = await Contact.find();
    const downloadData = await Download.find();
    const paperSubmissionData = await PaperSubmission.find();
    const enquiryData = await Enquiry.find();
    const memberData = await Committee.find();
    const registrationData = await Registration.find();

    res.json({
      totalFee,
      contactData,
      downloadData,
      paperSubmissionData,
      enquiryData,
      memberData,
      registrationData,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Failed to fetch data", error });
  }
});

app.get("/Upload/Speakers", async (req, res) => {
  try {
    const speakers = await Speaker.find().sort({ position: 1 });
    res.status(200).send(speakers);
  } catch (error) {
    res.status(500).send({ error: "Error fetching speakers" });
  }
});

app.get("/image/:id", async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }
    res.set("Content-Type", image.mimetype);
    res.send(image.data);
  } catch (error) {
    res.status(500).send({ error: "Error fetching speakers" });
  }
});

app.delete("/Speaker/Delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSpeaker = await Speaker.findByIdAndDelete(id);

    if (!deletedSpeaker) {
      return res.status(404).json({ error: "Speaker not found" });
    }

    res.status(200).json({
      message: "Speaker deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error deleting speaker" });
  }
});

app.post("/Speaker/Uploads", upload.single("Image"), async (req, res) => {
  try {
    const img = Image({
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      data: req.file.buffer,
      size: req.file.size,
    });
    const newSpeaker = new Speaker({
      ...req.body,
      Image: img._id,
    });
    await img.save();
    await newSpeaker.save();

    res.json({ message: "File uploaded and data saved successfully!" });
  } catch (error) {
    console.error("Error saving data:", error);
    if (error.name === "ValidationError") {
      const errorMessages = Object.values(error.errors).map(
        (err) => err.message
      );
      res.status(400).json({
        message: "Validation failed",
        errors: errorMessages,
      });
    } else {
      res.status(500).json({ message: "Failed to save data" });
    }
  }
});

app.post("/order", async (req, res) => {
  try {
    const { option, FormData, pricingData } = req.body;

    if (!option || !option.amount) {
      return res.status(400).json({ error: "Missing required payment fields" });
    }

    const amountInCents = Math.round(parseFloat(option.amount) * 100);

    const order = await razorpay.orders.create({
      amount: amountInCents,
      currency: "USD",
      receipt: `receipt_${new mongoose.Types.ObjectId()}`,
    });

    if (!order) {
      return res.status(500).json({ error: "Failed to create Razorpay order" });
    }

    // If coupon was used, increment usage count
    if (pricingData?.couponCode) {
      await Coupon.findOneAndUpdate(
        { code: pricingData.couponCode.toUpperCase() },
        { $inc: { usedCount: 1 } }
      );
    }

    const registrationData = new Registration({
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
      id: order.id,
      baseAmount: pricingData?.baseAmount || option.amount,
      finalAmount: pricingData?.finalAmount || option.amount,
      hasMembership: pricingData?.hasMembership || false,
      membershipFee: pricingData?.membershipFee || 0,
      couponCode: pricingData?.couponCode || null,
      couponDiscount: pricingData?.couponDiscount || 0,
      membershipDiscount: pricingData?.membershipDiscount || 0,
      FormData: {
        Title: FormData.Title,
        first_name: FormData.first_name,
        last_name: FormData.last_name,
        certificate_name: FormData.certificate_name,
        DOB: FormData.DOB,
        nationality: FormData.nationality,
        department: FormData.department,
        institution: FormData.institution,
        number: FormData.number,
        email: FormData.email,
        participant_category: FormData.participant_category,
        presentation_Category: FormData.presentation_Category,
        presentation_Type: FormData.presentation_Type,
      },
    });

    const HtmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <title>New Registration from ICSAP</title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: 'Montserrat', sans-serif; background-color: #f4f4f4;">
    <div style="width: 100%; max-width: 600px; margin: auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
        <h2 style="color: #278803; text-align: center; font-size: 28px; margin-bottom: 40px;">New Registration from ICSAPCI</h2>
        
        <div style="margin: 20px 0;">
            <h3 style="font-size: 18px;">Payment Details</h3>
            <table width="100%" style="border-collapse: collapse;">
                <tr>
                    <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Field</th>
                    <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Value</th>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Base Registration Fee</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">$${pricingData?.baseAmount || option.amount}</td>
                </tr>
                ${pricingData?.hasMembership && pricingData?.couponCode ? `
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px; color: #28a745;">Combined Discount (10%)</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px; color: #28a745;">-$${((pricingData.baseAmount || 0) * 0.10).toFixed(2)}</td>
                </tr>
                ` : ''}
                ${pricingData?.hasMembership && !pricingData?.couponCode ? `
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px; color: #28a745;">Membership Discount (5%)</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px; color: #28a745;">-$${(pricingData.membershipDiscount || 0).toFixed(2)}</td>
                </tr>
                ` : ''}
                ${!pricingData?.hasMembership && pricingData?.couponCode ? `
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px; color: #28a745;">Coupon Discount (5%)</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px; color: #28a745;">-$${(pricingData.couponDiscount || 0).toFixed(2)}</td>
                </tr>
                ` : ''}
                ${pricingData?.hasMembership ? `
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Membership Fee</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">+$${(pricingData.membershipFee || 0).toFixed(2)}</td>
                </tr>
                ` : ''}
                ${pricingData?.couponCode ? `
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Coupon Code Applied</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${pricingData.couponCode}</td>
                </tr>
                ` : ''}
                <tr style="background-color: #f2f2f2;">
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 16px; font-weight: bold;">Final Amount Paid</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 16px; font-weight: bold;">$${(order.amount / 100).toFixed(2)}</td>
                </tr>
            </table>
        </div>

        <div style="margin: 20px 0;">
            <h3 style="font-size: 18px;">Registration Details</h3>
            <table width="100%" style="border-collapse: collapse;">
                <tr>
                    <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Field</th>
                    <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Value</th>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Title</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.Title}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">First Name</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.first_name}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Last Name</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.last_name}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Certificate Name</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.certificate_name}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Date of Birth</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${new Date(FormData.DOB).toISOString().split("T")[0]}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Nationality</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.nationality}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Department</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.department}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Institution</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.institution}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Number</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.number}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Email</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.email}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Participant Category</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.participant_category}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Presentation Category</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.presentation_Category}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Presentation Type</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${FormData.presentation_Type}</td>
                </tr>
            </table>
        </div>
        <p style="font-size: 14px; text-align: center; margin-top: 20px;">Thank you for your registration!</p>
    </div>
</body>
</html>
`;

    await registrationData.save();
    res.status(200).json(order);
    await sendEmailToAdmin("New Registration from ICSAPCI", HtmlContent);
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({
      error: "An error occurred while creating the Razorpay order",
      message: error.message,
    });
  }
});

app.post("/order/validate", async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    Order_ID,
  } = req.body;

  const sha = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET);
  sha.update(`${razorpay_order_id}|${razorpay_payment_id}`);

  const digest = sha.digest("hex");

  if (digest !== razorpay_signature) {
    return res.status(400).json({ msg: "Transaction is not legit!" });
  }

  try {
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);

    const paymentStatus = paymentDetails.status;
    const registrationData = await Registration.findOne({
      id: Order_ID,
    });

    if (registrationData) {
      registrationData.status =
        paymentStatus === "captured"
          ? "Payment Paid"
          : `Payment Failed ${paymentStatus}`;
      await registrationData.save();
    }

    const payment = new Payment(paymentDetails);
    await payment.save();

    res.json({
      msg: "Payment Success",
    });

    console.log("Payment Success");
  } catch (error) {
    console.error("Error fetching payment details:", error);
    res.status(500).json({ msg: "Failed to fetch payment details" });
  }
});

app.post("/order/cancelation", async (req, res) => {
  try {
    const { Order_ID } = req.body;
    const registrationData = await Registration.findOne({
      id: Order_ID,
    });

    registrationData.status = "Payment Canceled";
    await registrationData.save();

    res.status(200).json({ message: "Payment canceled." });
  } catch (error) {
    console.error("Error while canceling order:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.post("/Contact_Form", async (req, res) => {
  try {
    const contactDetails = new Contact(req.body);

    const HtmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <title>New Registration from ICSAP</title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: 'Montserrat', sans-serif; background-color: #f4f4f4;">
    <div style="width: 100%; max-width: 600px; margin: auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
        <h2 style="color: #278803; text-align: center; font-size: 28px; margin-bottom: 40px;">New Contact from ICSAPCI</h2>
        <div style="margin: 20px 0;">
            <table width="100%" style="border-collapse: collapse;">
                <tr>
                    <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Field</th>
                    <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Value</th>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Full Name</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${contactDetails.First_Name}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Second Name</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${contactDetails.Second_Name}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Mobile Number</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${contactDetails.Mobile_Number}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Email</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${contactDetails.Email}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Message</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${contactDetails.Message}</td>
                </tr>
            </table>
        </div>
    </div>
</body>
</html>
`;
    await contactDetails.save();

    res.status(201).json({ message: "Information Send successfully" });
    await sendEmailToAdmin("New Contact from ICSAPCI", HtmlContent);
  } catch (error) {
    console.error("Error saving contact:", error);
    res
      .status(400)
      .json({ message: "Error saving contact", error: error.message });
  }
});

app.post("/Download", async (req, res) => {
  try {
    const DownloadForm = new Download(req.body);

    const HtmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <title>New Registration from ICSAP</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 20px; font-family: 'Montserrat', sans-serif; background-color: #f4f4f4;">
        <div style="width: 100%; max-width: 600px; margin: auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
            <h2 style="color: #278803; text-align: center; font-size: 28px; margin-bottom: 40px;">New Brochure Download from ICSAPCI</h2>
            <div style="margin: 20px 0;">
                <table width="100%" style="border-collapse: collapse;">
                    <tr>
                        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Field</th>
                        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Value</th>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Full Name</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${DownloadForm.Name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Mobile Number</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${DownloadForm.Number}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Email</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${DownloadForm.Email}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">How Did You Know</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${DownloadForm.Info}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Social Media Link</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${DownloadForm.Link}</td>
                    </tr>
                </table>
            </div>
        </div>
    </body>
    </html>
    `;

    await DownloadForm.save();

    res.status(201).json({ message: "Information Send successfully" });
    await sendEmailToAdmin("New Brochure Download from ICSAPCI", HtmlContent);
  } catch (error) {
    console.error("Error saving contact:", error);
    res
      .status(400)
      .json({ message: "Error saving contact", error: error.message });
  }
});

app.post("/OCM", upload.single("file"), async (req, res) => {
  try {
    const formData = {
      ...req.body,
      Uploaded_File: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      },
    };

    const OCMForm = new Committee(formData);

    const HtmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <title>New Organizing Committee Member from ICSAP</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 20px; font-family: 'Montserrat', sans-serif; background-color: #f4f4f4;">
        <div style="width: 100%; max-width: 600px; margin: auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
            <h2 style="color: #278803; text-align: center; font-size: 28px; margin-bottom: 40px;">New Organizing Committee Member from ICSAPCI</h2>
            <div style="margin: 20px 0;">
                <table width="100%" style="border-collapse: collapse;">
                    <tr>
                        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Field</th>
                        <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Value</th>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Title</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Title}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">First Name</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.First_Name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Email</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Email}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Mobile Number</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Number}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Country Code</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.NumberCountry}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Member Category</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Member_Category}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Organization</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Organization}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Qualification</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Qualification}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Professional Experience</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Professional_Experience}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Industry Experience</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Industry_Experience}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Department</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Department}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Specialization</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Specialization}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">H-index</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.h_index}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Country</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Country}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Associated CERADA</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Associated_Cerada}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Publication</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Publication}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">SCI Published</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.SCI_Published}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Journals</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Journals}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Conference Info</td>
                        <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${OCMForm.Conference_Info}</td>
                    </tr>
                </table>
            </div>
        </div>
    </body>
    </html>
    `;

    const attachments = [
      {
        filename: formData.Uploaded_File.originalname,
        content: formData.Uploaded_File.buffer,
        contentType: formData.Uploaded_File.mimetype,
      },
    ];

    await OCMForm.save();

    res.status(200).json({ message: "OCM submitted successfully!" });
    await sendEmailToAdmin(
      "New Organizing Committee Members ICSAPCI",
      HtmlContent,
      attachments
    );
  } catch (error) {
    console.error("Error processing the form:", error);
    res
      .status(500)
      .json({ message: "An error occurred while processing the form." });
  }
});

app.post("/Submission", upload.single("file"), async (req, res) => {
  try {
    console.log(req.body);
    const formData = {
      ...req.body,
      Uploaded_File: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer,
      },
    };

    const Submission = new PaperSubmission(formData);

    const HtmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <title>New Submission from ICSAPCI</title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: 'Montserrat', sans-serif; background-color: #f4f4f4;">
    <div style="width: 100%; max-width: 600px; margin: auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
        <h2 style="color: #278803; text-align: center; font-size: 28px; margin-bottom: 40px;">New Submission from ICSAPCI</h2>
        <div style="margin: 20px 0;">
            <table width="100%" style="border-collapse: collapse;">
                <tr>
                    <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Field</th>
                    <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Value</th>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Submission Type</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.Submission_type}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Submission ID</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.SubmissionID}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Paper Title</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.paper_title}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Author Name</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.authorName}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Co-Author Name</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.CoAuthorName}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Corresponding Email</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.correspondingEmail}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Mobile Number</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.mobileNumber}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">WhatsApp Number</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.whatsappNumber}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">LinkedIn URL</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;"><a href="${Submission.linkedinURL}">${Submission.linkedinURL}</a></td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Facebook URL</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;"><a href="${Submission.facebookURL}">${Submission.facebookURL}</a></td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Presentation Category</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.presentationCategory}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Presentation Type</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.presentationType}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Institution Name</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.Institution_Name}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Department</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.Department}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Designation</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.designation}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Publication Required</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.Publication_Required}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Conference Source</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.conferenceSource}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Message</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${Submission.message}</td>
                </tr>
            </table>
        </div>
    </div>
</body>
</html>
`;
    const attachments = [
      {
        filename: formData.Uploaded_File.originalname,
        content: formData.Uploaded_File.buffer,
        contentType: formData.Uploaded_File.mimetype,
      },
    ];

    const ReplayContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Submission Acknowledgment</title>
    <style>
        body {
            font-family: 'Montserrat', sans-serif; 
            background-color: #f8f8f8; 
            margin: 0; 
            padding: 0;
        }
        .container {
            max-width: 600px; 
            margin: 20px auto; 
            background-color: #ffffff; 
            border-radius: 5px; 
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); 
            padding: 20px; 
            text-align: center;
        }
        h1 {
            color: #00C4AC; 
            font-size: 28px; 
            margin-bottom: 10px;
             text-align: center;
        }
        p {
            color: #333333; 
            line-height: 1.6; 
            font-size: 16px; 
            margin: 10px 0;
        }
        .highlight {
            background-color: #00C4AC; 
            color: white; 
            padding: 5px 10px; 
            border-radius: 5px;
            text-wrap: no-wrap;
        }
        .contact-info {
            color: #00C4AC; 
            font-weight: bold;
        }
        .footer {
            margin-top: 20px; 
            font-size: 14px; 
            color: #777777;
        }
        @media (max-width: 800px) {
            h1 {
                font-size: 24px;
                text-align: center;
            }
            p {
                font-size: 14px;
            }
            .container {
                padding: 15px;
            }
        }
    </style>
</head>

<body>
    <div class="container">
        <h1>🎉 Thank You for Your Submission! 🎉</h1>
        <p>Dear Participant,</p>
        <p>
            Thank you for your submission to <span class="highlight">ICSAPCI 2025</span>! We truly appreciate your interest and the effort you have put into your work. 🙏
        </p>
        <p>Your Submission ID <b>${formData.SubmissionID}</b></p>
        <p>Our team will review your submission and reach out to you soon with further updates. 📅</p>
        <p>
            If you have any questions or need additional information, please feel free to contact us at 
            <span class="contact-info">+91 8072381719</span> or <span class="contact-info">info@icsap.co.in</span>. 📞✉️
        </p>
        <p>Thank you once again for your participation! 🌟</p>
        <div class="footer">
            <p>Best regards,<br>The ICSAP 2025 Team 💼</p>
        </div>
    </div>
</body>
</html>
`;

    await Submission.save();
    res.status(200).json({ message: "Paper submitted successfully!" });

    await sendEmailToAdmin(
      "New Submission from ICSAPCI",
      HtmlContent,
      attachments
    );

    await sendEmailToUser(
      "ICSAPCI 2025",
      ReplayContent,
      formData.correspondingEmail
    );
  } catch (error) {
    console.error("Error processing the form:", error);
    res
      .status(500)
      .json({ message: "An error occurred while processing the form." });
  }
});

app.post("/Enquiry", async (req, res) => {
  const EnquiryData = req.body;
  try {
    const EnquiryForm = new Enquiry(EnquiryData);

    const HtmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <title>New Registration from ICSAP</title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: 'Montserrat', sans-serif; background-color: #f4f4f4;">
    <div style="width: 100%; max-width: 600px; margin: auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
        <h2 style="color: #278803; text-align: center; font-size: 28px; margin-bottom: 40px;">New Enquiry from ICSAPCI</h2>
        <div style="margin: 20px 0;">
            <table width="100%" style="border-collapse: collapse;">
                <tr>
                    <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Field</th>
                    <th style="padding: 10px; border: 1px solid #dddddd; text-align: left; background-color: #f2f2f2; font-size: 15px;">Value</th>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Full Name</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${EnquiryForm.full_name}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Email</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${EnquiryForm.email}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Phone</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${EnquiryForm.phone}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Contact Method</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${EnquiryForm.contact_method}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Subject</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${EnquiryForm.subject}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Message</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${EnquiryForm.message}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Referral</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${EnquiryForm.referral}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">Contact Time</td>
                    <td style="padding: 10px; border: 1px solid #dddddd; text-align: left; font-size: 15px;">${EnquiryForm.contact_time}</td>
                </tr>
            </table>
        </div>
    </div>
</body>
</html>
`;
    await EnquiryForm.save();

    res.status(201).json({ message: "Enquiry send successfully" });
    await sendEmailToAdmin("New Enquiry from ICSAPCI", HtmlContent);
  } catch (error) {
    console.error("Error saving enquiry:", error);
    res.status(500).json({ message: "Failed to save enquiry" });
  }
});

app.get("/api/data", async (req, res) => {
  try {
    const registrationData = await Registration.find({});
    const contactData = await Contact.find({});
    const downloadData = await Download.find({});
    const committeeData = await Committee.find({});
    const paymentData = await Payment.find({});
    const paperSubmissionData = await PaperSubmission.find({});
    const enquiryData = await Enquiry.find({});

    res.json({
      registration: registrationData,
      contact: contactData,
      downloads: downloadData,
      committee: committeeData,
      payments: paymentData,
      submissions: paperSubmissionData,
      enquiries: enquiryData,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Error fetching data" });
  }
});

const loginSchema = new mongoose.Schema({
  Email: String,
  Password: String,
});

const Login = mongoose.model("Login", loginSchema);

app.get("/Logins/Admin/Registrations", async (req, res) => {
  try {
    const Logins = await Login.find();
    res.status(200).send(Logins);
  } catch (error) {
    res.status(500).send({ error: "Error fetching" });
  }
});

// app.get("/Login_ICSAP_CONFWORLD", async (req, res) => {
//   try {
//     const logins = await Login.find({});
//     res.json({
//       logins: logins,
//     });
//   } catch (err) {
//     console.error(err);
//   }
// });
const sendEmailToAdmin1 = async (subject, htmlContent) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER_INFO,
        pass: process.env.SMTP_PASS_INFO.replace(/\s/g, ''), // Remove spaces
      },
    });

    const result = await transporter.sendMail({
      from: process.env.SMTP_USER_INFO,
      to: process.env.EMAIL_ADMIN_INFO,
      subject: subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", result.messageId);
    return result;
  } catch (error) {
    console.error("Email error:", error.message);
    throw error;
  }
};

const HandleSponsor = async (req, res) => {
  try {
    const formData = req.body;
    console.log('Processing sponsor form:', formData);

    // Check for duplicate sponsor by email
    const sponsorExists = await Sponsor.findOne({ email: formData.email });
    if (sponsorExists) {
      return res
        .status(400)
        .json({ errorMessage: "Sponsor with this email already exists" });
    }

    // Create and save sponsor
    const newForm = new Sponsor(formData);
    const savedSponsor = await newForm.save();
    console.log('Sponsor saved to database:', savedSponsor._id);

    // Build email content
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sponsorship Form</title>
    <style>
        body {
            font-family: "Poppins", sans-serif;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        .container {
            width: 80%;
            margin: 0 auto;
            background: #ffffff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #00C4AC;
            font-size: 24px;
            margin-bottom: 20px;
            text-align: center;
            display: flex;
            align-items: center;
            gap: 10px;
            justify-content: center;
        }
        .highlight {
            background: #00C4AC;
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            display: inline-block;
            font-weight: bold;
            margin-bottom: 20px;
        }
        .info {
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .info label {
            font-weight: bold;
        }
        .info p {
            margin: 0px 8px;
        }
        .footer {
            font-size: 12px;
            color: #888;
            margin-top: 20px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>
          <svg width="16" height="16" fill="currentColor" class="bi bi-envelope" viewBox="0 0 16 16">
            <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm2 1v1.293l6 3.5 6-3.5V5H2zm0 2.207L8 11.207l6-3.5V11H2v-3.793z"/>
          </svg>
          Sponsorship Form
        </h1>

        <div class="highlight">Tier: ${formData.sponsorshipType || 'N/A'} | Price: ${formData.sponsorshipPrice || 'N/A'}</div>

        <div class="info"><label>Full Name:</label><p>${formData.fullName}</p></div>
        <div class="info"><label>Email:</label><p>${formData.email}</p></div>
        <div class="info"><label>Organization:</label><p>${formData.organization}</p></div>
        <div class="info"><label>Designation:</label><p>${formData.designation}</p></div>
        <div class="info"><label>Address:</label><p>${formData.address}</p></div>
        <div class="info"><label>City:</label><p>${formData.city}</p></div>
        <div class="info"><label>State:</label><p>${formData.state}</p></div>
        <div class="info"><label>Zip Code:</label><p>${formData.zipCode}</p></div>
        <div class="info"><label>Country:</label><p>${formData.country}</p></div>
        <div class="info"><label>Phone:</label><p>${formData.phone}</p></div>

        <div class="footer">
            <p>This email was generated as part of a sponsorship form submission.</p>
        </div>
    </div>
</body>
</html>`;

    // Try to send email and handle errors
    try {
      console.log('Attempting to send sponsor email...');
      await sendEmailToAdmin1("Sponsor Details", htmlContent);
      console.log('Sponsor email sent successfully');
      
      res.status(201).json({
        message: "Sponsor Details saved successfully and email sent",
        sponsor: savedSponsor,
        emailSent: true
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      
      // Still return success for the sponsor save, but indicate email failed
      res.status(201).json({
        message: "Sponsor Details saved successfully but email failed to send",
        sponsor: savedSponsor,
        emailSent: false,
        emailError: emailError.message
      });
    }

  } catch (err) {
    console.error("Sponsor Save Error:", err);
    res
      .status(500)
      .json({ errorMessage: err.message || "Internal Server Error" });
  }
}

// Route
app.post("/sponsor", HandleSponsor);



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const sendEmailToAdmin = async (subject, htmlContent, attachments) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.EMAIL_ADMIN,
      subject: subject,
      html: htmlContent,
      attachments: attachments,
    };

    await transporter.sendMail(mailOptions);
    console.log("Email sent to admin:", process.env.EMAIL_ADMIN);
  } catch (error) {
    console.error("Error sending email to admin:", error);
  }
};

const sendEmailToUser = async (subject, htmlContent, Email) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.EMAIL_ADMIN_USER,
        pass: process.env.SMTP_PASS_USER,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_ADMIN_USER,
      to: Email,
      subject: subject,
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
    console.log("Email sent to user:", Email);
  } catch (error) {
    console.error("Error sending email to user:", error);
  }
};

// CREATE - Add new coupon
app.post("/api/coupons", async (req, res) => {
  try {
    const { code, discountPercentage, expiryDate, usageLimit, description } = req.body;
    
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({ 
        success: false, 
        message: "Coupon code already exists" 
      });
    }

    const newCoupon = new Coupon({
      code: code.toUpperCase(),
      discountPercentage: discountPercentage || 5,
      expiryDate,
      usageLimit,
      description,
    });

    await newCoupon.save();
    res.status(201).json({ 
      success: true, 
      message: "Coupon created successfully", 
      coupon: newCoupon 
    });
  } catch (error) {
    console.error("Error creating coupon:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to create coupon", 
      error: error.message 
    });
  }
});

// READ - Get all coupons
app.get("/api/coupons", async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.status(200).json({ 
      success: true, 
      coupons 
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch coupons", 
      error: error.message 
    });
  }
});

// VALIDATE - Validate coupon code
app.post("/api/coupons/validate", async (req, res) => {
  try {
    const { code } = req.body;
    
    const coupon = await Coupon.findOne({ 
      code: code.toUpperCase(),
      isActive: true 
    });

    if (!coupon) {
      return res.status(404).json({ 
        success: false, 
        message: "Invalid coupon code" 
      });
    }

    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: "Coupon has expired" 
      });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ 
        success: false, 
        message: "Coupon usage limit reached" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "Coupon is valid",
      coupon: {
        code: coupon.code,
        discountPercentage: coupon.discountPercentage,
        description: coupon.description
      }
    });
  } catch (error) {
    console.error("Error validating coupon:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to validate coupon", 
      error: error.message 
    });
  }
});

// DELETE - Delete coupon
app.delete("/api/coupons/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedCoupon = await Coupon.findByIdAndDelete(id);

    if (!deletedCoupon) {
      return res.status(404).json({ 
        success: false, 
        message: "Coupon not found" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "Coupon deleted successfully" 
    });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to delete coupon", 
      error: error.message 
    });
  }
});

// TOGGLE - Toggle coupon active status
app.patch("/api/coupons/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);

    if (!coupon) {
      return res.status(404).json({ 
        success: false, 
        message: "Coupon not found" 
      });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    res.status(200).json({ 
      success: true, 
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
      coupon 
    });
  } catch (error) {
    console.error("Error toggling coupon:", error);
    res.status(500).json({ 
      success: false,  
      message: "Failed to toggle coupon", 
      error: error.message      
    });
  }
});



