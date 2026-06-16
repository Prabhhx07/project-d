import express from "express";
import pg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
dotenv.config({ quiet: true });

const app = express();
const port = 3000;
app.use(cors());
app.use(express.json());

const db = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
db.connect();

const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
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

const upload = multer({ storage });

app.post("/signup", async (req, res) => {
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

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

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

app.get("/profile", authenticateToken, async (req, res) => {
  const result = await db.query(
    "SELECT id, name, email FROM users WHERE id = $1",
    [req.user.userId],
  );
  res.json({ user: result.rows[0] });
});

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

      res.status(201).json({ membership: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

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

app.post(
  "/organizations/:id/files",
  authenticateToken,
  requireRole(["admin", "editor"]),
  upload.single("file"),
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

      res.status(201).json({ file: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

app.get(
  "/organizations/:id/files",
  authenticateToken,
  requireRole(["admin", "editor", "viewer"]),
  async (req, res) => {
    try {
      const orgId = req.params.id;

      const result = await db.query(
        `SELECT files.id, files.original_name, files.mime_type, files.size, files.created_at, users.name AS uploaded_by_name
         FROM files
         JOIN users ON users.id = files.uploaded_by
         WHERE files.org_id = $1
         ORDER BY files.created_at DESC`,
        [orgId],
      );

      res.json({ files: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);
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

    res.download(path.join("uploads", file.filename), file.original_name);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}.`);
});
