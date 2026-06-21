import dotenv from "dotenv";
import { Worker } from "bullmq";
import { connection } from "./queue.js";
import pg from "pg";

dotenv.config({ quiet: true });

const pool = new pg.Pool(
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

const worker = new Worker(
  "file-processing",
  async (job) => {
    const { fileId } = job.data;
    console.log(`Processing file ${fileId} (attempt ${job.attemptsMade})...`);

    await new Promise((resolve) => setTimeout(resolve, 5000));
    await pool.query("UPDATE files SET status = $1 WHERE id = $2", [
      "done",
      fileId,
    ]);
    console.log(`File ${fileId} marked done`);
  },
  { connection },
);

worker.on("failed", async (job, err) => {
  console.error(
    `Job ${job.id} failed (attempt ${job.attemptsMade}):`,
    err.message,
  );

  const maxAttempts = job.opts.attempts || 1;
  if (job.attemptsMade >= maxAttempts) {
    await pool.query("UPDATE files SET status = $1 WHERE id = $2", [
      "failed",
      job.data.fileId,
    ]);
  }
});
