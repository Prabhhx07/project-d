import express from "express";
import pg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileQueue, connection } from "./queue.js";
import { WebSocketServer } from "ws";
import { QueueEvents, Job } from "bullmq";
import IORedis from "ioredis";
import rateLimit from "express-rate-limit";
import swaggerJsdoc from "swagger-jsdoc";
// Run worker in the same process on free hosting (no separate worker service needed)
import "./worker.js";
import swaggerUi from "swagger-ui-express";
dotenv.config({ quiet: true });

const app = express();
const port = process.env.PORT || 3000;
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  }),
);
app.use(express.json());

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Project-D API",
      version: "1.0.0",
      description: "Multi-tenant document processing platform API",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./index.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

const db = new pg.Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      },
);
db.connect();

const uploadDir = process.env.UPLOAD_DIR || "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "text/plain",
];

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"));
    }
  },
});

async function createAuditLog(
  orgId,
  userId,
  action,
  targetType = null,
  targetId = null,
  metadata = null,
) {
  try {
    await db.query(
      `INSERT INTO audit_logs (org_id, user_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orgId,
        userId,
        action,
        targetType,
        targetId,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

/**
 * @swagger
 * /signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Missing fields or email already exists
 */

app.post("/signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existing = await db.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, hashedPassword],
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Login and receive a JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Returns JWT token
 *       401:
 *         description: Invalid credentials
 */

app.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = decoded;
    next();
  });
}

/**
 * @swagger
 * /profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns user info
 *       401:
 *         description: Unauthorized
 */

app.get("/profile", authenticateToken, async (req, res) => {
  const result = await db.query(
    "SELECT id, name, email FROM users WHERE id = $1",
    [req.user.userId],
  );
  res.json({ user: result.rows[0] });
});

/**
 * @swagger
 * /organizations:
 *   post:
 *     summary: Create a new organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Organization created
 *       401:
 *         description: Unauthorized
 */

app.post("/organizations", authenticateToken, async (req, res) => {
  const { name } = req.body;
  const userId = req.user.userId;

  if (!name) {
    return res.status(400).json({ error: "Organization name is required" });
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const orgResult = await client.query(
      "INSERT INTO organizations (name) VALUES ($1) RETURNING id, name, created_at",
      [name],
    );
    const org = orgResult.rows[0];

    await client.query(
      "INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)",
      [userId, org.id, "admin"],
    );

    await client.query("COMMIT");

    res.status(201).json({ organization: org });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /profile/password:
 *   patch:
 *     summary: Change current user's password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated
 *       401:
 *         description: Current password incorrect
 */

app.patch("/profile/password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: "Both current and new password are required" });
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "New password must be at least 8 characters" });
    }

    const userResult = await db.query(
      "SELECT password FROM users WHERE id = $1",
      [req.user.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(
      currentPassword,
      userResult.rows[0].password,
    );

    if (!isMatch) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.query("UPDATE users SET password = $1 WHERE id = $2", [
      hashedPassword,
      req.user.userId,
    ]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @swagger
 * /organizations/{id}:
 *   delete:
 *     summary: Delete an organization (admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Organization deleted
 *       403:
 *         description: Forbidden
 */

app.delete(
  "/organizations/:id",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const orgId = req.params.id;

      const orgResult = await db.query(
        "SELECT name FROM organizations WHERE id = $1",
        [orgId],
      );
      const orgName = orgResult.rows[0]?.name;

      const filesResult = await db.query(
        "SELECT filename FROM files WHERE org_id = $1",
        [orgId],
      );

      await createAuditLog(
        orgId,
        req.user.userId,
        "org.delete",
        "organization",
        orgId,
        { name: orgName },
      );
      await db.query("DELETE FROM organizations WHERE id = $1", [orgId]);

      for (const file of filesResult.rows) {
        try {
          await fs.promises.unlink(path.join(uploadDir, file.filename));
        } catch (err) {
          console.error("Failed to delete file from disk:", err);
        }
      }

      res.json({ message: "Organization deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

function requireRole(allowedRoles) {
  return async (req, res, next) => {
    try {
      const orgId = req.params.id;
      const userId = req.user.userId;

      const result = await db.query(
        "SELECT role FROM memberships WHERE user_id = $1 AND org_id = $2",
        [userId, orgId],
      );

      const membership = result.rows[0];

      if (!membership) {
        return res
          .status(403)
          .json({ error: "You are not a member of this organization" });
      }

      if (!allowedRoles.includes(membership.role)) {
        return res
          .status(403)
          .json({ error: "You do not have permission to perform this action" });
      }

      req.userRole = membership.role;
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  };
}

/**
 * @swagger
 * /organizations/{id}/invite:
 *   post:
 *     summary: Invite a user to the organization (admin only)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role]
 *             properties:
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, editor, viewer]
 *     responses:
 *       201:
 *         description: Member invited
 *       403:
 *         description: Forbidden
 */

app.post(
  "/organizations/:id/invite",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const orgId = req.params.id;
      const { email, role } = req.body;

      if (!email || !role) {
        return res.status(400).json({ error: "Email and role are required" });
      }

      if (!["admin", "editor", "viewer"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      const userResult = await db.query(
        "SELECT id FROM users WHERE email = $1",
        [email],
      );
      const user = userResult.rows[0];

      if (!user) {
        return res.status(404).json({ error: "No user found with that email" });
      }

      const existing = await db.query(
        "SELECT id FROM memberships WHERE user_id = $1 AND org_id = $2",
        [user.id, orgId],
      );

      if (existing.rows.length > 0) {
        return res
          .status(409)
          .json({ error: "User is already a member of this organization" });
      }

      const result = await db.query(
        "INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3) RETURNING id, user_id, org_id, role",
        [user.id, orgId, role],
      );

      await createAuditLog(
        orgId,
        req.user.userId,
        "member.invite",
        "user",
        user.id,
        { email: email, role: role },
      );
      res.status(201).json({ membership: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * @swagger
 * /organizations/{id}/members:
 *   get:
 *     summary: List members of an organization
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of members
 */

app.get(
  "/organizations/:id/members",
  authenticateToken,
  requireRole(["admin", "editor", "viewer"]),
  async (req, res) => {
    try {
      const orgId = req.params.id;

      const result = await db.query(
        `SELECT users.id, users.name, users.email, memberships.role
       FROM memberships
       JOIN users ON users.id = memberships.user_id
       WHERE memberships.org_id = $1`,
        [orgId],
      );

      res.json({ members: result.rows, currentUserRole: req.userRole });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * @swagger
 * /organizations/{id}/members/{userId}:
 *   patch:
 *     summary: Change a member's role (admin only)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, editor, viewer]
 *     responses:
 *       200:
 *         description: Role updated
 *       400:
 *         description: Cannot change last admin
 *   delete:
 *     summary: Remove a member from organization (admin only)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Member removed
 *       400:
 *         description: Cannot remove last admin
 */

app.patch(
  "/organizations/:id/members/:userId",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const orgId = req.params.id;
      const { userId } = req.params;
      const { role: newRole } = req.body;

      if (!["admin", "editor", "viewer"].includes(newRole)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      const membershipResult = await db.query(
        "SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2",
        [orgId, userId],
      );

      if (membershipResult.rows.length === 0) {
        return res.status(404).json({ error: "Member not found" });
      }

      const currentRole = membershipResult.rows[0].role;

      if (currentRole === "admin" && newRole !== "admin") {
        const adminCountResult = await db.query(
          "SELECT COUNT(*) FROM memberships WHERE org_id = $1 AND role = 'admin'",
          [orgId],
        );

        if (parseInt(adminCountResult.rows[0].count, 10) <= 1) {
          return res.status(400).json({
            error: "Cannot change the role of the last admin",
          });
        }
      }

      await db.query(
        "UPDATE memberships SET role = $1 WHERE org_id = $2 AND user_id = $3",
        [newRole, orgId, userId],
      );
      await createAuditLog(
        orgId,
        req.user.userId,
        "member.role_change",
        "user",
        userId,
        { from: currentRole, to: newRole },
      );
      res.json({ message: "Role updated" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * @swagger
 * /organizations/{id}/members/{userId}:
 *   delete:
 *     summary: Remove a member from organization (admin only)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Member removed
 *       400:
 *         description: Cannot remove last admin
 *       404:
 *         description: Member not found
 */

app.delete(
  "/organizations/:id/members/:userId",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const orgId = req.params.id;
      const { userId } = req.params;

      const membershipResult = await db.query(
        "SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2",
        [orgId, userId],
      );

      if (membershipResult.rows.length === 0) {
        return res.status(404).json({ error: "Member not found" });
      }

      const targetRole = membershipResult.rows[0].role;

      if (targetRole === "admin") {
        const adminCountResult = await db.query(
          "SELECT COUNT(*) FROM memberships WHERE org_id = $1 AND role = 'admin'",
          [orgId],
        );

        if (parseInt(adminCountResult.rows[0].count, 10) <= 1) {
          return res.status(400).json({
            error: "Cannot remove the last admin from an organization",
          });
        }
      }

      await db.query(
        "DELETE FROM memberships WHERE org_id = $1 AND user_id = $2",
        [orgId, userId],
      );

      await createAuditLog(
        orgId,
        req.user.userId,
        "member.remove",
        "user",
        userId,
      );

      res.json({ message: "Member removed" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * @swagger
 * /organizations:
 *   get:
 *     summary: List organizations for current user
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations with user role
 */

app.get("/organizations", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(
      `SELECT organizations.id, organizations.name, organizations.created_at, memberships.role
       FROM memberships
       JOIN organizations ON organizations.id = memberships.org_id
       WHERE memberships.user_id = $1`,
      [userId],
    );

    res.json({ organizations: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @swagger
 * /organizations/{id}/files:
 *   post:
 *     summary: Upload a file to an organization (admin/editor only)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: File uploaded and queued for processing
 *       400:
 *         description: No file or invalid file type/size
 *   get:
 *     summary: List files in an organization
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of files with status
 */

app.post(
  "/organizations/:id/files",
  authenticateToken,
  requireRole(["admin", "editor"]),

  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .json({ error: "File too large. Max size is 10MB." });
        }
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      next();
    });
  },

  async (req, res) => {
    try {
      const orgId = req.params.id;
      const userId = req.user.userId;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const result = await db.query(
        `INSERT INTO files (org_id, uploaded_by, filename, original_name, mime_type, size)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, filename, original_name, mime_type, size, created_at`,
        [
          orgId,
          userId,
          req.file.filename,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
        ],
      );

      await fileQueue.add(
        "process-file",
        { fileId: result.rows[0].id },
        { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      );
      await connection.del(`files:${orgId}`);
      await createAuditLog(
        orgId,
        userId,
        "file.upload",
        "file",
        result.rows[0].id,
        {
          filename: req.file.originalname,
        },
      );
      res.status(201).json({ file: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * @swagger
 * /organizations/{id}/files:
 *   get:
 *     summary: List files in an organization
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of files with status
 *       403:
 *         description: Forbidden
 */

app.get(
  "/organizations/:id/files",
  authenticateToken,
  requireRole(["admin", "editor", "viewer"]),
  async (req, res) => {
    try {
      const orgId = req.params.id;
      const cacheKey = `files:${orgId}`;

      const cached = await connection.get(cacheKey);
      if (cached) {
        console.log(`Cache hit for org ${orgId} files`);
        return res.json({ files: JSON.parse(cached) });
      }
      console.log(`Cache miss for org ${orgId} files`);

      const result = await db.query(
        `SELECT files.id, files.status, files.original_name, files.mime_type, files.size, files.created_at, users.name AS uploaded_by_name
         FROM files
         JOIN users ON users.id = files.uploaded_by
         WHERE files.org_id = $1
         ORDER BY files.created_at DESC`,
        [orgId],
      );

      await connection.set(cacheKey, JSON.stringify(result.rows), "EX", 60);

      res.json({ files: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * @swagger
 * /organizations/{id}/files/{fileId}:
 *   delete:
 *     summary: Delete a file (admin/editor only)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: File deleted
 *       404:
 *         description: File not found
 */

app.delete(
  "/organizations/:id/files/:fileId",
  authenticateToken,
  requireRole(["admin", "editor"]),
  async (req, res) => {
    try {
      const orgId = req.params.id;
      const { fileId } = req.params;

      const fileResult = await db.query(
        "SELECT * FROM files WHERE id = $1 AND org_id = $2",
        [fileId, orgId],
      );

      if (fileResult.rows.length === 0) {
        return res.status(404).json({ error: "File not found" });
      }

      const file = fileResult.rows[0];

      await db.query("DELETE FROM files WHERE id = $1", [fileId]);
      await connection.del(`files:${orgId}`);
      try {
        await fs.promises.unlink(path.join(uploadDir, file.filename));
      } catch (err) {
        console.error("Failed to delete file from disk:", err);
      }

      await createAuditLog(
        orgId,
        req.user.userId,
        "file.delete",
        "file",
        fileId,
        { filename: file.original_name },
      );
      res.json({ message: "File deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

/**
 * @swagger
 * /files/{fileId}/download:
 *   get:
 *     summary: Download a file
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: File download
 *       403:
 *         description: Forbidden
 *       404:
 *         description: File not found
 */

app.get("/files/:fileId/download", authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const userId = req.user.userId;

    const result = await db.query("SELECT * FROM files WHERE id = $1", [
      fileId,
    ]);
    const file = result.rows[0];

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    const membership = await db.query(
      "SELECT role FROM memberships WHERE user_id = $1 AND org_id = $2",
      [userId, file.org_id],
    );

    if (membership.rows.length === 0) {
      return res
        .status(403)
        .json({ error: "You don't have access to this file" });
    }

    res.download(path.join(uploadDir, file.filename), file.original_name);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get(
  "/organizations/:id/audit-logs",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const orgId = req.params.id;

      const result = await db.query(
        `SELECT audit_logs.*, users.name AS performed_by
         FROM audit_logs
         LEFT JOIN users ON users.id = audit_logs.user_id
         WHERE audit_logs.org_id = $1
         ORDER BY audit_logs.created_at DESC
         LIMIT 50`,
        [orgId],
      );

      res.json({ logs: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

export const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const wss = new WebSocketServer({ server });
const orgSockets = new Map();

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const orgId = url.searchParams.get("orgId");

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch (err) {
    ws.close(4001, "Unauthorized");
    return;
  }

  const membership = await db.query(
    "SELECT role FROM memberships WHERE user_id = $1 AND org_id = $2",
    [userId, orgId],
  );
  if (membership.rows.length === 0) {
    ws.close(4003, "Forbidden");
    return;
  }

  if (!orgSockets.has(orgId)) {
    orgSockets.set(orgId, new Set());
  }
  orgSockets.get(orgId).add(ws);
  console.log(`User ${userId} subscribed to org ${orgId} updates`);

  ws.on("close", () => {
    orgSockets.get(orgId)?.delete(ws);
    console.log(`User ${userId} disconnected from org ${orgId}`);
  });
});

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const eventsConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith("rediss://")
    ? { rejectUnauthorized: false }
    : undefined,
});

const queueEvents = new QueueEvents("file-processing", {
  connection: eventsConnection,
});

async function notifyOrg(fileId, status) {
  const result = await db.query("SELECT org_id FROM files WHERE id = $1", [
    fileId,
  ]);
  const orgId = result.rows[0]?.org_id;
  if (orgId === undefined) return;

  await connection.del(`files:${orgId}`);

  const sockets = orgSockets.get(String(orgId));
  if (!sockets) return;

  const message = JSON.stringify({ type: "file-status", fileId, status });
  for (const socket of sockets) {
    socket.send(message);
  }
}

queueEvents.on("completed", async ({ jobId }) => {
  const job = await Job.fromId(fileQueue, jobId);
  if (job) await notifyOrg(job.data.fileId, "done");
});

queueEvents.on("retries-exhausted", async ({ jobId }) => {
  const job = await Job.fromId(fileQueue, jobId);
  if (job) await notifyOrg(job.data.fileId, "failed");
});

export default app;
