let handler;

function isApiHealthRequest(req) {
  const method = req.method || "";
  if (method !== "GET" && method !== "HEAD") return false;
  const path = (req.url || "").split("?")[0];
  return path === "/api/health" || path === "/api/health/";
}

export default async function vercelHandler(req, res) {
  if (isApiHealthRequest(req)) {
    if (req.method === "HEAD") {
      res.status(200).end();
    } else {
      res.status(200).json({ ok: true, message: "API is running" });
    }
    return;
  }

  // Dynamic imports keep /api/health cold starts tiny and let Mongo connect overlap Express load.
  const { connectDB } = await import("../backend/src/config/db.js");
  const connectPromise = connectDB();

  const [{ default: app }, { default: serverless }] = await Promise.all([
    import("../backend/src/app.js"),
    import("serverless-http")
  ]);

  try {
    await connectPromise;
  } catch (err) {
    console.error("connectDB failed:", err?.message || err);
    if (!res.headersSent) {
      res.status(503).json({
        message:
          "Database connection failed. Confirm MONGO_URI on Vercel and MongoDB Atlas Network Access (e.g. allow 0.0.0.0/0 for serverless)."
      });
    }
    return;
  }

  if (!handler) {
    handler = serverless(app);
  }
  return handler(req, res);
}
