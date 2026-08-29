import crypto from "crypto";
import {
  validateAttribution,
  validateAttributionBatch,
  saveAttributionRecord,
  getScholarAttributionHistory,
  getAttributionStats,
} from "../../services/attribution/attributionValidationService.js";
import Scholar from "../../models/Scholar.js";
import Attribution from "../../models/Attribution.js";
import logger from "../../config/logger.js";

/**
 * POST /api/attribution/validate
 * Validate a single scholarly attribution.
 */
export const validateAttributionHandler = async (req, res) => {
  try {
    const { quotedText, scholarName, topic } = req.body;

    if (!quotedText || !scholarName || !topic) {
      return res.status(400).json({
        success: false,
        message: "quotedText, scholarName, and topic are required",
      });
    }

    if (quotedText.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Quoted text must not exceed 5000 characters",
      });
    }

    if (topic.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Topic must not exceed 200 characters",
      });
    }

    const result = await validateAttribution({
      quotedText,
      scholarName,
      topic,
      metadata: {
        requestedBy: req.user?._id || null,
        source: req.headers["x-source"] || "api",
        ipHash: req.ip ? crypto.createHash("sha256").update(req.ip).digest("hex").slice(0, 16) : null,
        userAgent: req.headers["user-agent"] || null,
      },
    });

    // Block delivery of fabricated attributions
    if (result.validationResult === "blocked") {
      return res.status(403).json({
        success: false,
        message: "Attribution blocked: this attribution appears to be fabricated or misattributed",
        data: {
          attributionId: result.attributionId,
          validationResult: result.validationResult,
          confidence: result.confidence,
          flags: result.flags,
          auditTrail: result.auditTrail,
        },
      });
    }

    // Save audit record
    await saveAttributionRecord(result);

    const statusCode = result.validationResult === "verified" ? 200 : 200;
    res.status(statusCode).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Error validating attribution:", error);
    res.status(500).json({
      success: false,
      message: "Failed to validate attribution",
    });
  }
};

/**
 * POST /api/attribution/validate/batch
 * Validate multiple attributions in batch.
 */
export const validateBatchHandler = async (req, res) => {
  try {
    const { attributions } = req.body;

    if (!Array.isArray(attributions) || attributions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "attributions must be a non-empty array",
      });
    }

    if (attributions.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Batch size must not exceed 50",
      });
    }

    // Validate each attribution has required fields
    for (const attr of attributions) {
      if (!attr.quotedText || !attr.scholarName || !attr.topic) {
        return res.status(400).json({
          success: false,
          message: "Each attribution must have quotedText, scholarName, and topic",
        });
      }
    }

    const result = await validateAttributionBatch(
      attributions.map((attr) => ({
        ...attr,
        metadata: {
          requestedBy: req.user?._id || null,
          source: req.headers["x-source"] || "api",
          ipHash: req.ip ? crypto.createHash("sha256").update(req.ip).digest("hex").slice(0, 16) : null,
          userAgent: req.headers["user-agent"] || null,
        },
      }))
    );

    // Save all audit records
    await Promise.all(
      result.results.map((r) => saveAttributionRecord(r))
    );

    res.status(200).json({
      success: true,
      data: result.results,
      summary: result.summary,
    });
  } catch (error) {
    logger.error("Error validating batch attributions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to validate batch attributions",
    });
  }
};

/**
 * GET /api/attribution/scholars
 * List all verified scholars.
 */
export const listScholarsHandler = async (req, res) => {
  try {
    const { page = 1, limit = 20, era, status = "active" } = req.query;

    const query = {};
    if (era) query.era = era;
    if (status) query.status = status;

    const skip = (Math.max(1, Number(page) || 1) - 1) * Math.min(100, Math.max(1, Number(limit) || 20));

    const [scholars, total] = await Promise.all([
      Scholar.find(query)
        .select("-verifiedOpinions -biographySources")
        .sort({ name: 1 })
        .skip(skip)
        .limit(Math.min(100, Number(limit) || 20))
        .lean(),
      Scholar.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: scholars,
      pagination: {
        total,
        page: Number(page) || 1,
        limit: Math.min(100, Number(limit) || 20),
        pages: Math.ceil(total / Math.min(100, Number(limit) || 20)),
      },
    });
  } catch (error) {
    logger.error("Error listing scholars:", error);
    res.status(500).json({
      success: false,
      message: "Failed to list scholars",
    });
  }
};

/**
 * GET /api/attribution/scholars/:id
 * Get a specific scholar's full profile including verified opinions.
 */
export const getScholarHandler = async (req, res) => {
  try {
    const scholar = await Scholar.findById(req.params.id).lean();

    if (!scholar) {
      return res.status(404).json({
        success: false,
        message: "Scholar not found",
      });
    }

    res.status(200).json({
      success: true,
      data: scholar,
    });
  } catch (error) {
    logger.error("Error getting scholar:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get scholar",
    });
  }
};

/**
 * POST /api/attribution/scholars
 * Add a new scholar to the database (admin only).
 */
export const addScholarHandler = async (req, res) => {
  try {
    const {
      name,
      arabicName,
      bornYear,
      diedYear,
      era,
      title,
      schoolsOfThought,
      primaryWorks,
      biographySources,
      verifiedOpinions,
    } = req.body;

    if (!name || !era) {
      return res.status(400).json({
        success: false,
        message: "name and era are required",
      });
    }

    const existing = await Scholar.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Scholar "${name}" already exists`,
      });
    }

    const scholar = await Scholar.create({
      name,
      arabicName,
      bornYear,
      diedYear,
      era,
      title,
      schoolsOfThought: schoolsOfThought || [],
      primaryWorks: primaryWorks || [],
      biographySources: biographySources || [],
      verifiedOpinions: verifiedOpinions || [],
      verifiedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Scholar added successfully",
      data: scholar,
    });
  } catch (error) {
    logger.error("Error adding scholar:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add scholar",
    });
  }
};

/**
 * GET /api/attribution/history/:scholarId
 * Get attribution history for a scholar.
 */
export const getAttributionHistoryHandler = async (req, res) => {
  try {
    const { scholarId } = req.params;
    const { page, limit, validationResult } = req.query;

    const result = await getScholarAttributionHistory(scholarId, {
      page,
      limit,
      validationResult,
    });

    res.status(200).json({
      success: true,
      data: result.records,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error("Error getting attribution history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get attribution history",
    });
  }
};

/**
 * GET /api/attribution/stats
 * Get attribution validation statistics (admin only).
 */
export const getAttributionStatsHandler = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await getAttributionStats({ startDate, endDate });

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Error getting attribution stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get attribution stats",
    });
  }
};

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default {
  validateAttributionHandler,
  validateBatchHandler,
  listScholarsHandler,
  getScholarHandler,
  addScholarHandler,
  getAttributionHistoryHandler,
  getAttributionStatsHandler,
};
