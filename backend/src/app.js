import "dotenv/config";
import cors from "cors";
import express from "express";
import authRouter from "./routes/auth.js";
import jobLinksRouter from "./routes/jobLinks.js";
import adminUsersRouter from "./routes/adminUsers.js";
import adminJobLinksRouter from "./routes/adminJobLinks.js";
import analyticsRouter from "./routes/analytics.js";
import financeRouter from "./routes/finance.js";
import interviewsRouter from "./routes/interviews.js";
import teamAccountsRouter from "./routes/teamAccounts.js";
import totpEntriesRouter from "./routes/totpEntries.js";
import userDirectoryRouter from "./routes/userDirectory.js";

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
app.use("/api/users", userDirectoryRouter);
app.use("/api/job-links", jobLinksRouter);
app.use("/api/admin/users", adminUsersRouter);
app.use("/api/admin/job-links", adminJobLinksRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/finance", financeRouter);
app.use("/api/interviews", interviewsRouter);
app.use("/api/team-accounts", teamAccountsRouter);
app.use("/api/totp-entries", totpEntriesRouter);

export default app;
