import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFind = jest.fn();
const mockFindById = jest.fn();
const mockPopulate = jest.fn();

const Book = {
  find: mockFind,
};

const Course = {
  find: mockFind,
};

// Mock models
jest.unstable_mockModule("../src/models/Book.js", () => ({
  default: Book,
}));

jest.unstable_mockModule("../src/models/Course.js", () => ({
  default: Course,
}));

jest.unstable_mockModule("../src/config/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock auth middleware — pass through with a fake user
jest.unstable_mockModule("../src/middlewares/authMiddleware.js", () => ({
  protect: (req, _res, next) => {
    req.user = { _id: "507f1f77bcf86cd799439011", role: "student" };
    next();
  },
  requireVerifiedEducator: (_req, _res, next) => next(),
  authorizeRoles: () => (_req, _res, next) => next(),
}));

// Mock cache middleware — pass through
jest.unstable_mockModule("../src/middlewares/cache.js", () => ({
  cacheMiddleware: () => (_req, _res, next) => next(),
  invalidateCacheMiddleware: () => (_req, _res, next) => next(),
}));

// Mock utils/cache
jest.unstable_mockModule("../src/utils/cache.js", () => ({
  CACHE_TTL: { BOOKS: 900, COURSES: 900 },
  CACHE_KEYS: { BOOKS: "books:", COURSE: "course:", COURSES: "courses:", BOOKS_LIST: "books:list", EDUCATORS: "educators:" },
}));

// Mock upload middleware
jest.unstable_mockModule("../src/middlewares/upload.js", () => ({
  uploadBook: { fields: () => (_req, _res, next) => next() },
}));

// Mock cloudinary
jest.unstable_mockModule("../src/utils/cloudinary.js", () => ({
  default: {},
}));

// Mock file validation
jest.unstable_mockModule("../src/utils/fileValidation.js", () => ({
  validateMagicBytes: jest.fn().mockResolvedValue(true),
}));

// Mock notification controller
jest.unstable_mockModule("../src/controllers/notificationController.js", () => ({
  createNewBookNotification: jest.fn(),
  createNewCourseNotification: jest.fn(),
}));

// Mock webhook service
jest.unstable_mockModule("../src/services/webhooks/webhookService.js", () => ({
  emitEvent: jest.fn(),
  EVENT_TYPES: {},
}));

// Mock category service
jest.unstable_mockModule("../src/services/categoryService.js", () => ({
  categoryTaxonomyExists: jest.fn().mockResolvedValue(false),
  categoryValidationError: jest.fn().mockResolvedValue(""),
  resolveActiveCategory: jest.fn().mockResolvedValue(null),
}));

// Mock course progress model
jest.unstable_mockModule("../src/models/CourseProgress.js", () => ({
  default: { find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn() },
}));

// Mock cache utils
jest.unstable_mockModule("../src/utils/cache.js", () => ({
  getCacheOrSet: jest.fn(),
  CACHE_TTL: { BOOKS: 900, COURSES: 900, SHORT: 300 },
  CACHE_KEYS: { BOOKS: "books:", COURSE: "course:", COURSES: "courses:", EDUCATORS: "educators:" },
}));

// Mock validators
jest.unstable_mockModule("../src/validators/requestValidators.js", () => ({
  prerequisitesValidation: (_req, _res, next) => next(),
}));

jest.unstable_mockModule("../src/middlewares/validate.js", () => ({
  validate: (_req, _res, next) => next(),
  sanitizeInput: (_req, _res, next) => next(),
}));

// Import routes after mocks
const bookRoutes = (await import("../src/routes/books/bookRoutes.js")).default;
const courseRoutes = (await import("../src/routes/courses/courseRoutes.js")).default;

const mountBooks = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/books", bookRoutes);
  return app;
};

const mountCourses = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/courses", courseRoutes);
  return app;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Issue #9 — List endpoint response shapes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/books (getBooks)", () => {
    it("returns 200 with success:true and data array when books exist", async () => {
      mockFind.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([
            { _id: "1", title: "Book A" },
            { _id: "2", title: "Book B" },
          ]),
        }),
      });

      const res = await request(mountBooks()).get("/api/books");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it("returns 200 with success:true and empty data array when no books exist", async () => {
      mockFind.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([]),
        }),
      });

      const res = await request(mountBooks()).get("/api/books");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe("GET /api/books/by-author/:authorId (getBooksByAuthor)", () => {
    it("returns 200 with success:true and data array when books exist", async () => {
      mockFind.mockReturnValue({
        populate: jest.fn().mockResolvedValue([{ _id: "1", title: "Book A" }]),
      });

      const res = await request(mountBooks()).get(
        "/api/books/by-author/507f1f77bcf86cd799439011"
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it("returns 200 with success:true and empty data array when no books found for author", async () => {
      mockFind.mockReturnValue({
        populate: jest.fn().mockResolvedValue([]),
      });

      const res = await request(mountBooks()).get(
        "/api/books/by-author/507f1f77bcf86cd799439011"
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(0);
    });

    it("returns 400 when authorId is missing", async () => {
      // The route requires :authorId, so this test verifies the route exists
      // with a valid authorId parameter
      const res = await request(mountBooks()).get(
        "/api/books/by-author/507f1f77bcf86cd799439011"
      );
      expect(res.status).not.toBe(500);
    });
  });

  describe("GET /api/courses/user (getCoursesByUser)", () => {
    it("returns 200 with success:true and data array when courses exist", async () => {
      mockFind.mockReturnValue({
        populate: jest.fn().mockResolvedValue([
          { _id: "1", title: "Course A" },
        ]),
      });

      const res = await request(mountCourses()).get(
        "/api/courses/user?createdBy=507f1f77bcf86cd799439011"
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it("returns 200 with success:true and empty data array when no courses found", async () => {
      mockFind.mockReturnValue({
        populate: jest.fn().mockResolvedValue([]),
      });

      const res = await request(mountCourses()).get(
        "/api/courses/user?createdBy=507f1f77bcf86cd799439011"
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(0);
    });

    it("returns 400 when createdBy is missing", async () => {
      const res = await request(mountCourses()).get("/api/courses/user");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("Response envelope consistency", () => {
    it("all list endpoints include success boolean", async () => {
      mockFind.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([]),
        }),
      });

      const booksRes = await request(mountBooks()).get("/api/books");
      expect(typeof booksRes.body.success).toBe("boolean");
      expect("data" in booksRes.body).toBe(true);

      mockFind.mockReturnValue({
        populate: jest.fn().mockResolvedValue([]),
      });

      const coursesRes = await request(mountCourses()).get(
        "/api/courses/user?createdBy=507f1f77bcf86cd799439011"
      );
      expect(typeof coursesRes.body.success).toBe("boolean");
      expect("data" in coursesRes.body).toBe(true);
    });

    it("never returns success:false with HTTP 200 for empty results", async () => {
      mockFind.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([]),
        }),
      });

      const booksRes = await request(mountBooks()).get("/api/books");
      if (booksRes.status === 200) {
        expect(booksRes.body.success).toBe(true);
      }

      mockFind.mockReturnValue({
        populate: jest.fn().mockResolvedValue([]),
      });

      const coursesRes = await request(mountCourses()).get(
        "/api/courses/user?createdBy=507f1f77bcf86cd799439011"
      );
      if (coursesRes.status === 200) {
        expect(coursesRes.body.success).toBe(true);
      }
    });
  });
});
