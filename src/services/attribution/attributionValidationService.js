import crypto from "crypto";
import mongoose from "mongoose";
import Scholar from "../../models/Scholar.js";
import Attribution from "../../models/Attribution.js";
import logger from "../../config/logger.js";

/**
 * Era constants for temporal validation.
 * Maps era names to approximate year ranges.
 */
const ERA_RANGES = {
  classical: { start: 0, end: 500 },
  medieval: { start: 500, end: 1500 },
  early_modern: { start: 1500, end: 1800 },
  modern: { start: 1800, end: 1950 },
  contemporary: { start: 1950, end: 2100 },
};

/**
 * Topic-to-era mapping for anachronism detection.
 * Maps topics to the eras they could plausibly be discussed in.
 */
const TOPIC_ERA_ELIGIBILITY = {
  blockchain: ["modern", "contemporary"],
  cryptocurrency: ["modern", "contemporary"],
  artificial_intelligence: ["modern", "contemporary"],
  internet: ["modern", "contemporary"],
  quantum_computing: ["modern", "contemporary"],
  digital_ethics: ["modern", "contemporary"],
  environmental_science: ["modern", "contemporary"],
  feminist_theology: ["modern", "contemporary"],
  genetic_engineering: ["modern", "contemporary"],
  space_exploration: ["modern", "contemporary"],
  classical_fiqh: ["classical", "medieval"],
  usul_al_fiqh: ["classical", "medieval"],
  tafsir: ["classical", "medieval", "early_modern"],
  hadith: ["classical", "medieval"],
  aqidah: ["classical", "medieval", "early_modern", "modern", "contemporary"],
  seerah: ["classical", "medieval"],
  islamic_law: ["classical", "medieval", "early_modern", "modern", "contemporary"],
  sharia: ["classical", "medieval", "early_modern", "modern", "contemporary"],
  halal: ["classical", "medieval", "early_modern", "modern", "contemporary"],
  zakat: ["classical", "medieval", "early_modern", "modern", "contemporary"],
  fasting: ["classical", "medieval", "early_modern", "modern", "contemporary"],
  hajj: ["classical", "medieval", "early_modern", "modern", "contemporary"],
  marriage: ["classical", "medieval", "early_modern", "modern", "contemporary"],
  inheritance: ["classical", "medieval", "early_modern", "modern", "contemporary"],
  commerce: ["classical", "medieval", "early_modern", "modern", "contemporary"],
};

/**
 * Generate a unique attribution ID.
 */
const generateAttributionId = () => {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(6).toString("hex");
  return `attr_${timestamp}_${random}`;
};

/**
 * Check temporal consistency: Is the scholar's era compatible with the topic?
 * Returns { pass: boolean, detail: string }
 */
export const checkTemporalConsistency = (scholar, topic) => {
  const normalizedTopic = topic
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const eligibleEras = TOPIC_ERA_ELIGIBILITY[normalizedTopic];

  if (!eligibleEras) {
    // No mapping means we can't determine anachronism — allow through
    return { pass: true, detail: `No era mapping for topic: ${topic}` };
  }

  if (!eligibleEras.includes(scholar.era)) {
    return {
      pass: false,
      detail: `Anachronistic attribution: ${scholar.name} (${scholar.era}) cannot have held opinions on "${topic}" which is associated with eras: ${eligibleEras.join(", ")}`,
    };
  }

  return { pass: true, detail: "Temporal consistency check passed" };
};

/**
 * Check opinion authenticity: Does the scholar have a verified opinion on this topic?
 * Returns { pass: boolean, detail: string, opinion: object | null }
 */
export const checkOpinionAuthenticity = (scholar, topic) => {
  const normalizedTopic = topic
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const opinion = scholar.verifiedOpinions.find(
    (op) =>
      op.topic.toLowerCase().replace(/[\s-]+/g, "_") === normalizedTopic
  );

  if (!opinion) {
    return {
      pass: false,
      detail: `No verified opinion found for ${scholar.name} on topic: ${topic}`,
      opinion: null,
    };
  }

  return {
    pass: true,
    detail: `Verified opinion found: "${opinion.position}" (source: ${opinion.source})`,
    opinion,
  };
};

/**
 * Check for misrepresentation of nuanced positions.
 * Returns { pass: boolean, detail: string, flags: string[] }
 */
export const checkNuanceRepresentation = (opinion, quotedText) => {
  if (!opinion) {
    return { pass: true, detail: "No opinion to check for nuance", flags: [] };
  }

  const flags = [];
  const text = quotedText.toLowerCase();

  // If the verified position is "disputed" or "contextual", check if the
  // quoted text presents it as an absolute position
  if (
    (opinion.nuanceLevel === "disputed" ||
      opinion.nuanceLevel === "contextual") &&
    !text.includes("some say") &&
    !text.includes("it is said") &&
    !text.includes("according to some") &&
    !text.includes("there is a view") &&
    !text.includes("it is reported") &&
    !text.includes("generally") &&
    !text.includes("in some contexts")
  ) {
    flags.push("nuance_lost");
  }

  return {
    pass: flags.length === 0,
    detail:
      flags.length > 0
        ? "Position is contextual/disputed but quoted text presents it as absolute"
        : "Nuance check passed",
    flags,
  };
};

/**
 * Validate a single scholarly attribution.
 * Returns the full validation result including audit trail.
 */
export const validateAttribution = async ({
  quotedText,
  scholarName,
  topic,
  metadata = {},
}) => {
  const auditTrail = [];
  const flags = [];
  let scholar = null;
  let finalConfidence = 100;

  // Step 1: Find the scholar
  scholar = await Scholar.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(scholarName)}$`, "i") },
    status: "active",
  });

  if (!scholar) {
    auditTrail.push({
      step: "temporal_check",
      status: "fail",
      detail: `Scholar not found: ${scholarName}`,
    });
    return buildResult({
      attributionId: generateAttributionId(),
      quotedText,
      scholarName,
      topic,
      confidence: 0,
      validationResult: "blocked",
      flags: ["fabricated"],
      auditTrail,
      metadata,
    });
  }

  // Step 2: Temporal consistency check
  const temporalResult = checkTemporalConsistency(scholar, topic);
  auditTrail.push({
    step: "temporal_check",
    status: temporalResult.pass ? "pass" : "fail",
    detail: temporalResult.detail,
  });

  if (!temporalResult.pass) {
    flags.push("anachronistic");
    finalConfidence -= 40;
  }

  // Step 3: Opinion verification
  const opinionResult = checkOpinionAuthenticity(scholar, topic);
  auditTrail.push({
    step: "opinion_verification",
    status: opinionResult.pass ? "pass" : "fail",
    detail: opinionResult.detail,
  });

  if (!opinionResult.pass) {
    flags.push("fabricated");
    finalConfidence -= 30;
  }

  // Step 4: Nuance check
  const nuanceResult = checkNuanceRepresentation(
    opinionResult.opinion,
    quotedText
  );
  auditTrail.push({
    step: "nuance_detection",
    status: nuanceResult.pass ? "pass" : "warn",
    detail: nuanceResult.detail,
  });

  if (nuanceResult.flags.length > 0) {
    flags.push(...nuanceResult.flags);
    finalConfidence -= 20;
  }

  // Step 5: Source cross-reference check
  const sourceCheck =
    scholar.verifiedOpinions.length > 0 &&
    scholar.biographySources.length > 0
      ? {
          pass: true,
          detail: `Cross-referenced against ${scholar.verifiedOpinions.length} verified opinions and ${scholar.biographySources.length} biographical sources`,
        }
      : {
          pass: false,
          detail: `Insufficient cross-reference data for ${scholar.name}: ${scholar.verifiedOpinions.length} opinions, ${scholar.biographySources.length} sources`,
        };

  auditTrail.push({
    step: "source_cross_reference",
    status: sourceCheck.pass ? "pass" : "warn",
    detail: sourceCheck.detail,
  });

  if (!sourceCheck.pass) {
    finalConfidence -= 10;
  }

  // Step 6: Anachronism detection (classical scholar + modern opinion)
  if (
    ["classical", "medieval", "early_modern"].includes(scholar.era) &&
    opinionResult.opinion &&
    opinionResult.opinion.nuanceLevel === "absolute"
  ) {
    // Could be a modern opinion attributed to a classical scholar
    const modernTopics = [
      "blockchain",
      "cryptocurrency",
      "artificial_intelligence",
      "internet",
      "digital_ethics",
    ];
    if (modernTopics.includes(topic.toLowerCase().replace(/[\s-]+/g, "_"))) {
      flags.push("modern_opinion_attributed_to_classical");
      finalConfidence -= 25;
    }
  }

  auditTrail.push({
    step: "anachronism_detection",
    status: flags.includes("anachronistic") ? "fail" : "pass",
    detail: flags.includes("anachronistic")
      ? "Anachronistic attribution detected"
      : "No anachronism detected",
  });

  // Step 7: Consensus validation
  auditTrail.push({
    step: "consensus_validation",
    status: "pass",
    detail: "Consensus validation not applicable for individual attribution",
  });

  // Final decision
  finalConfidence = Math.max(0, Math.min(100, finalConfidence));

  let validationResult;
  if (finalConfidence >= 80 && flags.length === 0) {
    validationResult = "verified";
  } else if (flags.includes("fabricated") || finalConfidence < 30) {
    validationResult = "blocked";
  } else {
    validationResult = "flagged";
  }

  auditTrail.push({
    step: "final_decision",
    status: validationResult === "verified" ? "pass" : "fail",
    detail: `Final decision: ${validationResult} (confidence: ${finalConfidence}%, flags: ${flags.length})`,
  });

  return buildResult({
    attributionId: generateAttributionId(),
    quotedText,
    scholarId: scholar._id,
    scholarName: scholar.name,
    topic,
    confidence: finalConfidence,
    validationResult,
    flags,
    auditTrail,
    metadata,
  });
};

/**
 * Validate multiple attributions in batch.
 */
export const validateAttributionBatch = async (attributions) => {
  const results = await Promise.all(
    attributions.map((attr) => validateAttribution(attr))
  );

  const summary = {
    total: results.length,
    verified: results.filter((r) => r.validationResult === "verified").length,
    flagged: results.filter((r) => r.validationResult === "flagged").length,
    blocked: results.filter((r) => r.validationResult === "blocked").length,
    avgConfidence:
      results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
  };

  return { results, summary };
};

/**
 * Save an attribution audit record to the database.
 */
export const saveAttributionRecord = async (attributionData) => {
  try {
    const record = await Attribution.create(attributionData);
    return record;
  } catch (error) {
    logger.error("Failed to save attribution record:", error);
    return null;
  }
};

/**
 * Get attribution history for a specific scholar.
 */
export const getScholarAttributionHistory = async (scholarId, options = {}) => {
  const { page = 1, limit = 20, validationResult } = options;

  const query = { scholarId: new mongoose.Types.ObjectId(scholarId) };
  if (validationResult) {
    query.validationResult = validationResult;
  }

  const skip = (Math.max(1, Number(page) || 1) - 1) * Math.min(100, Math.max(1, Number(limit) || 20));

  const [records, total] = await Promise.all([
    Attribution.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(100, Number(limit) || 20))
      .lean(),
    Attribution.countDocuments(query),
  ]);

  return {
    records,
    pagination: {
      total,
      page: Number(page) || 1,
      limit: Math.min(100, Number(limit) || 20),
      pages: Math.ceil(total / Math.min(100, Number(limit) || 20)),
    },
  };
};

/**
 * Get attribution statistics (flag counts, validation breakdown).
 */
export const getAttributionStats = async (filters = {}) => {
  const { startDate, endDate } = filters;

  const matchStage = {};
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  const pipeline = [
    ...(Object.keys(matchStage).length > 0
      ? [{ $match: matchStage }]
      : []),
    {
      $group: {
        _id: "$validationResult",
        count: { $sum: 1 },
        avgConfidence: { $avg: "$confidence" },
      },
    },
  ];

  const flagPipeline = [
    ...(Object.keys(matchStage).length > 0
      ? [{ $match: matchStage }]
      : []),
    { $unwind: "$flags" },
    {
      $group: {
        _id: "$flags",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ];

  const [validationBreakdown, flagBreakdown] = await Promise.all([
    Attribution.aggregate(pipeline),
    Attribution.aggregate(flagPipeline),
  ]);

  const total = validationBreakdown.reduce((sum, v) => sum + v.count, 0);

  return {
    total,
    validationBreakdown,
    flagBreakdown,
  };
};

// Helper
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildResult({
  attributionId,
  quotedText,
  scholarId,
  scholarName,
  topic,
  confidence,
  validationResult,
  flags,
  auditTrail,
  metadata,
}) {
  return {
    attributionId,
    quotedText,
    scholarId: scholarId || null,
    scholarName,
    topic,
    confidence,
    validationResult,
    flags,
    auditTrail,
    metadata,
  };
}

export default {
  validateAttribution,
  validateAttributionBatch,
  saveAttributionRecord,
  getScholarAttributionHistory,
  getAttributionStats,
  checkTemporalConsistency,
  checkOpinionAuthenticity,
  checkNuanceRepresentation,
};
