import "dotenv/config";
import cors from "cors";
import express from "express";
import authRouter from "./routes/auth.js";
import jobLinksRouter from "./routes/jobLinks.js";
import adminUsersRouter from "./routes/adminUsers.js";
import analyticsRouter from "./routes/analytics.js";

const app = express();

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
  : null;

app.use(
  cors({
    origin: corsOrigins && corsOrigins.length ? corsOrigins : true,
    credentials: true
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "API is running" });
});

app.use("/api/auth", authRouter);
app.use("/api/job-links", jobLinksRouter);
app.use("/api/admin/users", adminUsersRouter);
app.use("/api/analytics", analyticsRouter);

export default app;
