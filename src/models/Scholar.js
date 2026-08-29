import mongoose from "mongoose";

const verifiedOpinionSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true, trim: true },
    position: { type: String, required: true, trim: true },
    source: { type: String, required: true, trim: true },
    sourcePage: { type: String, default: null },
    nuanceLevel: {
      type: String,
      enum: ["absolute", "general", "contextual", "disputed"],
      default: "general",
    },
    verifiedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const scholarSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    arabicName: {
      type: String,
      default: null,
      trim: true,
    },
    bornYear: {
      type: Number,
      default: null,
    },
    diedYear: {
      type: Number,
      default: null,
    },
    era: {
      type: String,
      enum: ["classical", "medieval", "early_modern", "modern", "contemporary"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: null,
      trim: true,
    },
    schoolsOfThought: [
      {
        type: String,
        trim: true,
      },
    ],
    primaryWorks: [
      {
        title: { type: String, required: true },
        topic: { type: String, default: null },
      },
    ],
    biographySources: [
      {
        name: { type: String, required: true },
        author: { type: String, default: null },
        year: { type: Number, default: null },
      },
    ],
    verifiedOpinions: [verifiedOpinionSchema],
    status: {
      type: String,
      enum: ["active", "inactive", "banned"],
      default: "active",
      index: true,
    },
    verifiedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

scholarSchema.index({ name: "text", arabicName: "text" });
scholarSchema.index({ "verifiedOpinions.topic": 1 });

export default mongoose.model("Scholar", scholarSchema);
