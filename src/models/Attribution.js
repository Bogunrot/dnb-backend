import mongoose from "mongoose";

const auditEntrySchema = new mongoose.Schema(
  {
    step: {
      type: String,
      required: true,
      enum: [
        "temporal_check",
        "opinion_verification",
        "source_cross_reference",
        "nuance_detection",
        "consensus_validation",
        "anachronism_detection",
        "final_decision",
      ],
    },
    status: {
      type: String,
      required: true,
      enum: ["pass", "fail", "warn"],
    },
    detail: { type: String, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const attributionSchema = new mongoose.Schema(
  {
    attributionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    quotedText: {
      type: String,
      required: true,
      trim: true,
    },
    scholarId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Scholar",
      required: true,
      index: true,
    },
    scholarName: {
      type: String,
      required: true,
      trim: true,
    },
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    validationResult: {
      type: String,
      enum: ["verified", "flagged", "blocked"],
      required: true,
      index: true,
    },
    flags: [
      {
        type: String,
        enum: [
          "anachronistic",
          "fabricated",
          "misrepresented",
          "consensus_invented",
          "wrong_scholar",
          "modern_opinion_attributed_to_classical",
          "nuance_lost",
          "no_primary_source",
        ],
      },
    ],
    auditTrail: [auditEntrySchema],
    metadata: {
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      source: { type: String, default: null },
      ipHash: { type: String, default: null, select: false },
      userAgent: { type: String, default: null },
    },
  },
  { timestamps: true }
);

attributionSchema.index({ validationResult: 1, createdAt: -1 });
attributionSchema.index({ flags: 1 });
attributionSchema.index({ scholarId: 1, topic: 1 });

export default mongoose.model("Attribution", attributionSchema);
