import express from "express";
import { protect, authorizeRoles } from "../../middlewares/authMiddleware.js";
import {
  validateAttributionHandler,
  validateBatchHandler,
  listScholarsHandler,
  getScholarHandler,
  addScholarHandler,
  getAttributionHistoryHandler,
  getAttributionStatsHandler,
} from "../../controllers/attribution/attributionController.js";

const router = express.Router();

// Validate a single attribution
router.post("/validate", protect, validateAttributionHandler);

// Validate a batch of attributions
router.post("/validate/batch", protect, validateBatchHandler);

// List scholars (paginated, filterable by era/status)
router.get("/scholars", protect, listScholarsHandler);

// Get a specific scholar's profile
router.get("/scholars/:id", protect, getScholarHandler);

// Add a new scholar (admin only)
router.post("/scholars", protect, authorizeRoles("admin"), addScholarHandler);

// Get attribution history for a scholar
router.get("/history/:scholarId", protect, getAttributionHistoryHandler);

// Get attribution statistics (admin only)
router.get("/stats", protect, authorizeRoles("admin"), getAttributionStatsHandler);

export default router;
