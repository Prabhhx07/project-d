import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
} from "@jest/globals";

process.env.JWT_SECRET = "test-secret";

const mockQuery = jest.fn();

jest.unstable_mockModule("pg", () => ({
  default: { Pool: jest.fn(() => ({ query: mockQuery, connect: jest.fn() })) },
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
const bcrypt = (await import("bcrypt")).default;
const jwt = (await import("jsonwebtoken")).default;

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("POST /signup", () => {
  beforeEach(() => mockQuery.mockReset());

  it("returns 400 if fields are missing", async () => {
    const res = await request(app).post("/signup").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
  });

  it("returns 409 if email already exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .post("/signup")
      .send({ name: "Test", email: "a@b.com", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("creates user and returns 201", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ id: 1, name: "Test", email: "a@b.com" }],
    });
    const res = await request(app)
      .post("/signup")
      .send({ name: "Test", email: "a@b.com", password: "password123" });
    expect(res.status).toBe(201);
  });
});

describe("POST /login", () => {
  beforeEach(() => mockQuery.mockReset());

  it("returns 400 if fields are missing", async () => {
    const res = await request(app).post("/login").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
  });

  it("returns 401 if user not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post("/login")
      .send({ email: "a@b.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns 401 if password is wrong", async () => {
    const hash = await bcrypt.hash("correctpassword", 10);
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, email: "a@b.com", password: hash }],
    });
    const res = await request(app)
      .post("/login")
      .send({ email: "a@b.com", password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  it("returns token on successful login", async () => {
    const hash = await bcrypt.hash("correctpassword", 10);
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, email: "a@b.com", password: hash }],
    });
    const res = await request(app)
      .post("/login")
      .send({ email: "a@b.com", password: "correctpassword" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });
});

describe("GET /profile", () => {
  it("returns 401 without token", async () => {
    const res = await request(app).get("/profile");
    expect(res.status).toBe(401);
  });

  it("returns profile with valid token", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Test", email: "a@b.com", created_at: new Date() }],
    });
    const token = jwt.sign({ userId: 1, email: "a@b.com" }, "test-secret");
    const res = await request(app)
      .get("/profile")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("a@b.com");
  });
});
