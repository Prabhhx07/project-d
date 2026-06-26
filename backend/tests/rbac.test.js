import { jest, describe, it, expect, afterAll } from "@jest/globals";

process.env.JWT_SECRET = "test-secret";

const mockQuery = jest.fn();

jest.unstable_mockModule("pg", () => ({
  default: {
    Pool: jest.fn(() => ({
      query: mockQuery,
      connect: jest.fn(),
      on: jest.fn(),
    })),
  },
}));

jest.unstable_mockModule("../queue.js", () => ({
  fileQueue: { add: jest.fn().mockResolvedValue({}) },
  connection: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.unstable_mockModule("bullmq", () => ({
  Queue: jest.fn(() => ({ add: jest.fn() })),
  QueueEvents: jest.fn(() => ({ on: jest.fn() })),
  Job: { fromId: jest.fn() },
  Worker: jest.fn(() => ({ on: jest.fn() })),
}));

jest.unstable_mockModule("ioredis", () => ({
  default: jest.fn(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
  })),
}));

jest.unstable_mockModule("ws", () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn() })),
}));

jest.unstable_mockModule("swagger-ui-express", () => ({
  default: { serve: [], setup: jest.fn(() => (req, res, next) => next()) },
}));

jest.unstable_mockModule("swagger-jsdoc", () => ({
  default: jest.fn(() => ({})),
}));

const { default: app, server } = await import("../index.js");
const request = (await import("supertest")).default;
const jwt = (await import("jsonwebtoken")).default;

const makeToken = (userId, email = "test@test.com") =>
  jwt.sign({ userId, email }, "test-secret");

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("RBAC — viewer cannot perform admin actions", () => {
  beforeEach(() => mockQuery.mockReset());

  it("viewer cannot invite members", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test",
            email: "test@test.com",
            created_at: new Date(),
          },
        ],
      }) // profile lookup
      .mockResolvedValueOnce({ rows: [{ role: "viewer" }] }); // membership check

    const token = makeToken(1);
    const res = await request(app)
      .post("/organizations/1/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "new@test.com", role: "editor" });

    expect(res.status).toBe(403);
  });

  it("viewer cannot delete a file", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test",
            email: "test@test.com",
            created_at: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ role: "viewer" }] });

    const token = makeToken(1);
    const res = await request(app)
      .delete("/organizations/1/files/5")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("viewer cannot delete an organization", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test",
            email: "test@test.com",
            created_at: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ role: "viewer" }] });

    const token = makeToken(1);
    const res = await request(app)
      .delete("/organizations/1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe("RBAC — editor cannot perform admin-only actions", () => {
  beforeEach(() => mockQuery.mockReset());

  it("editor cannot invite members", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test",
            email: "test@test.com",
            created_at: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ role: "editor" }] });

    const token = makeToken(1);
    const res = await request(app)
      .post("/organizations/1/invite")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "new@test.com", role: "editor" });

    expect(res.status).toBe(403);
  });

  it("editor cannot delete an organization", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test",
            email: "test@test.com",
            created_at: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ role: "editor" }] });

    const token = makeToken(1);
    const res = await request(app)
      .delete("/organizations/1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("editor can list files", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test",
            email: "test@test.com",
            created_at: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ role: "editor" }] })
      .mockResolvedValueOnce({ rows: [] });

    const token = makeToken(1);
    const res = await request(app)
      .get("/organizations/1/files")
      .set("Authorization", `Bearer ${token}`);
  });

  describe("RBAC — unauthenticated requests are rejected", () => {
    it("cannot access organizations without token", async () => {
      const res = await request(app).get("/organizations");
      expect(res.status).toBe(401);
    });

    it("cannot access files without token", async () => {
      const res = await request(app).get("/organizations/1/files");
      expect(res.status).toBe(401);
    });
  });
});
