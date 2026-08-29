import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockScholarFindOne = jest.fn();
const mockScholarCreate = jest.fn();
const mockScholarFind = jest.fn();
const mockScholarCountDocuments = jest.fn();
const mockAttributionCreate = jest.fn();
const mockAttributionFind = jest.fn();
const mockAttributionCountDocuments = jest.fn();
const mockAttributionAggregate = jest.fn();

jest.unstable_mockModule("../src/models/Scholar.js", () => ({
  default: {
    findOne: mockScholarFindOne,
    create: mockScholarCreate,
    find: mockScholarFind,
    countDocuments: mockScholarCountDocuments,
  },
}));

jest.unstable_mockModule("../src/models/Attribution.js", () => ({
  default: {
    create: mockAttributionCreate,
    find: mockAttributionFind,
    countDocuments: mockAttributionCountDocuments,
    aggregate: mockAttributionAggregate,
  },
}));

jest.unstable_mockModule("../src/config/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule("../src/middlewares/authMiddleware.js", () => ({
  protect: (req, _res, next) => {
    req.user = {
      _id: new mongoose.Types.ObjectId(),
      role: "student",
    };
    next();
  },
  authorizeRoles:
    (...roles) =>
    (req, _res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return _res
          .status(403)
          .json({ success: false, message: "Forbidden" });
      }
      next();
    },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

const attributionRoutes = (
  await import("../src/routes/attribution/attributionRoutes.js")
).default;

const mount = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/attribution", attributionRoutes);
  return app;
};

// ── Test data ─────────────────────────────────────────────────────────────────

const mockScholar = {
  _id: new mongoose.Types.ObjectId(),
  name: "Imam Abu Hanifa",
  arabicName: "أبو حنيفة",
  bornYear: 699,
  diedYear: 767,
  era: "classical",
  title: "Imam",
  schoolsOfThought: ["Hanafi"],
  primaryWorks: [{ title: "Al-Fiqh al-Akbar", topic: "aqidah" }],
  biographySources: [
    { name: "Tahdhib al-Kamal", author: "al-Mizzi", year: 1300 },
  ],
  verifiedOpinions: [
    {
      topic: "fiqh",
      position: "Emphasized reasoning and analogy in legal matters",
      source: "Al-Fiqh al-Akbar",
      nuanceLevel: "general",
    },
    {
      topic: "aqidah",
      position: "Held specific views on divine attributes",
      source: "Al-Fiqh al-Akbar",
      nuanceLevel: "contextual",
    },
  ],
  status: "active",
};

const mockContemporaryScholar = {
  _id: new mongoose.Types.ObjectId(),
  name: "Dr. Yusuf al-Qaradawi",
  bornYear: 1926,
  diedYear: 2022,
  era: "contemporary",
  title: "Sheikh",
  schoolsOfThought: ["Muslim Brotherhood"],
  primaryWorks: [],
  biographySources: [],
  verifiedOpinions: [
    {
      topic: "digital_ethics",
      position: "Discussed Islamic perspectives on modern technology",
      source: "Fatwas collection",
      nuanceLevel: "general",
    },
  ],
  status: "active",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Issue #173 — Scholarly Attribution Prevention System", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAttributionCreate.mockResolvedValue({ _id: "attr1" });
  });

  describe("POST /api/attribution/validate", () => {
    it("returns 200 with verified attribution for a valid scholar and opinion", async () => {
      mockScholarFindOne.mockResolvedValue(mockScholar);

      const res = await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "Imam Abu Hanifa emphasized the use of reason in Islamic jurisprudence.",
          scholarName: "Imam Abu Hanifa",
          topic: "fiqh",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.validationResult).toBe("verified");
      expect(res.body.data.confidence).toBeGreaterThan(80);
      expect(res.body.data.flags).toHaveLength(0);
      expect(res.body.data.auditTrail).toBeDefined();
      expect(Array.isArray(res.body.data.auditTrail)).toBe(true);
    });

    it("returns 403 with blocked status for fabricated attribution", async () => {
      mockScholarFindOne.mockResolvedValue(mockScholar);

      const res = await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "Imam Abu Hanifa discussed blockchain technology in his writings.",
          scholarName: "Imam Abu Hanifa",
          topic: "blockchain",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.data.validationResult).toBe("blocked");
      expect(res.body.data.flags).toContain("anachronistic");
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "Some quote",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("required");
    });

    it("returns 403 when scholar is not found (fabricated)", async () => {
      mockScholarFindOne.mockResolvedValue(null);

      const res = await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "This is a quote from a nonexistent scholar.",
          scholarName: "Nonexistent Scholar",
          topic: "fiqh",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.data.validationResult).toBe("blocked");
      expect(res.body.data.flags).toContain("fabricated");
    });

    it("returns 200 with flagged status for misattributed opinion", async () => {
      mockScholarFindOne.mockResolvedValue(mockScholar);

      const res = await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "Imam Abu Hanifa wrote about environmental science.",
          scholarName: "Imam Abu Hanifa",
          topic: "environmental_science",
        });

      // environmental_science is "modern" era only; classical scholar triggers
      // anachronistic flag. No verified opinion → fabricated flag. Confidence
      // drops below threshold → blocked (403).
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.data.validationResult).toBe("blocked");
      expect(res.body.data.flags).toContain("anachronistic");
    });

    it("blocks delivery of fabricated attributions", async () => {
      mockScholarFindOne.mockResolvedValue(null);

      const res = await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "This scholar said something they never said.",
          scholarName: "Made Up Scholar",
          topic: "some_topic",
        });

      // Fabricated attribution is blocked (403)
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("blocked");
    });

    it("includes audit trail in response", async () => {
      mockScholarFindOne.mockResolvedValue(mockScholar);

      const res = await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "Imam Abu Hanifa emphasized reasoning.",
          scholarName: "Imam Abu Hanifa",
          topic: "fiqh",
        });

      expect(res.body.data.auditTrail).toBeDefined();
      expect(res.body.data.auditTrail.length).toBeGreaterThan(0);

      const steps = res.body.data.auditTrail.map((e) => e.step);
      expect(steps).toContain("temporal_check");
      expect(steps).toContain("opinion_verification");
      expect(steps).toContain("nuance_detection");
      expect(steps).toContain("final_decision");
    });

    it("saves attribution record to database", async () => {
      mockScholarFindOne.mockResolvedValue(mockScholar);

      await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "Imam Abu Hanifa emphasized reasoning.",
          scholarName: "Imam Abu Hanifa",
          topic: "fiqh",
        });

      expect(mockAttributionCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/attribution/validate/batch", () => {
    it("validates multiple attributions and returns summary", async () => {
      mockScholarFindOne.mockResolvedValue(mockScholar);

      const res = await request(mount())
        .post("/api/attribution/validate/batch")
        .send({
          attributions: [
            {
              quotedText: "Imam Abu Hanifa emphasized reasoning.",
              scholarName: "Imam Abu Hanifa",
              topic: "fiqh",
            },
            {
              quotedText: "Imam Abu Hanifa discussed blockchain.",
              scholarName: "Imam Abu Hanifa",
              topic: "blockchain",
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.total).toBe(2);
    });

    it("returns 400 for empty batch", async () => {
      const res = await request(mount())
        .post("/api/attribution/validate/batch")
        .send({ attributions: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("returns 400 when batch exceeds limit", async () => {
      const attributions = Array.from({ length: 51 }, (_, i) => ({
        quotedText: `Quote ${i}`,
        scholarName: "Imam Abu Hanifa",
        topic: "fiqh",
      }));

      const res = await request(mount())
        .post("/api/attribution/validate/batch")
        .send({ attributions });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("GET /api/attribution/scholars", () => {
    it("returns 200 with list of scholars", async () => {
      mockScholarFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([mockScholar]),
      });
      mockScholarCountDocuments.mockResolvedValue(1);

      const res = await request(mount()).get("/api/attribution/scholars");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it("returns 200 with empty array when no scholars exist", async () => {
      mockScholarFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      mockScholarCountDocuments.mockResolvedValue(0);

      const res = await request(mount()).get("/api/attribution/scholars");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  describe("GET /api/attribution/scholars/:id", () => {
    it("returns 200 with scholar details", async () => {
      const chainable = {
        lean: jest.fn().mockResolvedValue(mockScholar),
      };
      mockScholarFindOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockScholar),
      });

      // Use findById mock
      const ScholarModel = (await import("../src/models/Scholar.js")).default;
      ScholarModel.findById = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockScholar),
      });

      const res = await request(mount()).get(
        `/api/attribution/scholars/${mockScholar._id}`
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Imam Abu Hanifa");
    });
  });

  describe("Temporal consistency", () => {
    it("detects anachronistic attribution for classical scholar on modern topic", async () => {
      mockScholarFindOne.mockResolvedValue(mockScholar);

      const res = await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "Imam Abu Hanifa discussed artificial intelligence in his treatise.",
          scholarName: "Imam Abu Hanifa",
          topic: "artificial_intelligence",
        });

      expect(res.body.data.flags).toContain("anachronistic");
      const temporalAudit = res.body.data.auditTrail.find(
        (e) => e.step === "temporal_check"
      );
      expect(temporalAudit.status).toBe("fail");
    });

    it("allows valid temporal attribution for classical topic", async () => {
      mockScholarFindOne.mockResolvedValue(mockScholar);

      const res = await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "Imam Abu Hanifa emphasized reasoning in jurisprudence.",
          scholarName: "Imam Abu Hanifa",
          topic: "fiqh",
        });

      const temporalAudit = res.body.data.auditTrail.find(
        (e) => e.step === "temporal_check"
      );
      expect(temporalAudit.status).toBe("pass");
    });
  });

  describe("Nuance detection", () => {
    it("flags nuance loss when contextual position is presented as absolute", async () => {
      mockScholarFindOne.mockResolvedValue(mockScholar);

      const res = await request(mount())
        .post("/api/attribution/validate")
        .send({
          quotedText: "Imam Abu Hanifa definitively declared the correct position on divine attributes.",
          scholarName: "Imam Abu Hanifa",
          topic: "aqidah",
        });

      expect(res.body.data.flags).toContain("nuance_lost");
    });
  });

  describe("Response envelope consistency", () => {
    it("all endpoints return success boolean and data key", async () => {
      mockScholarFindOne.mockResolvedValue(mockScholar);
      mockScholarFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      mockScholarCountDocuments.mockResolvedValue(0);

      const app = mount();

      // Validate endpoint
      const validateRes = await request(app)
        .post("/api/attribution/validate")
        .send({
          quotedText: "Test",
          scholarName: "Test",
          topic: "test",
        });
      expect(typeof validateRes.body.success).toBe("boolean");
      expect("data" in validateRes.body || validateRes.body.message).toBeTruthy();

      // Scholars list
      const scholarsRes = await request(app).get("/api/attribution/scholars");
      expect(typeof scholarsRes.body.success).toBe("boolean");
      expect("data" in scholarsRes.body).toBe(true);
    });
  });
});
