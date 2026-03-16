import mongoose from "mongoose";

const { Schema } = mongoose;

const CardSchema = new Schema(
  {
    id: { type: String, required: true },
    entity: { type: String, required: true },
    name: { type: String, default: "" },
    last4: { type: String, required: true },
    network: { type: String, required: true },
    type: { type: String, required: true },
    issuer: { type: String, default: null },
    international: { type: Boolean, default: false },
    emi: { type: Boolean, default: false },
    sub_type: { type: String, required: true },
    token_iin: { type: String, default: null },
  },
  { _id: false }
);

const PaymentSchema = new Schema({
  id: { type: String, required: true },
  entity: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  base_amount: { type: Number, required: true },
  base_currency: { type: String, required: true },
  status: { type: String, required: true },
  order_id: { type: String, required: true },
  invoice_id: { type: String, default: null },
  international: { type: Boolean, required: true },
  method: { type: String, required: true },
  amount_refunded: { type: Number, required: true },
  refund_status: { type: String, default: null },
  captured: { type: Boolean, required: true },
  description: { type: String, required: true },
  card_id: { type: String, required: true },
  card: { type: CardSchema, required: true },
  bank: { type: String, default: null },
  wallet: { type: String, default: null },
  vpa: { type: String, default: null },
  email: { type: String, required: true },
  contact: { type: String, required: true },
  notes: { type: Object, default: {} },
  fee: { type: Number, required: true },
  tax: { type: Number, required: true },
  error_code: { type: String, default: null },
  error_description: { type: String, default: null },
  error_source: { type: String, default: null },
  error_step: { type: String, default: null },
  error_reason: { type: String, default: null },
  acquirer_data: { type: Object, default: {} },
  created_at: { type: Date, default: Date.now },
});

const Payment = mongoose.model("Payment", PaymentSchema);

export default Payment;
