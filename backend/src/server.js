import app from "./app.js";
import { connectDB } from "./config/db.js";
import { startCalendarAutoSync } from "./services/calendarAutoSync.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    const stopAutoSync = startCalendarAutoSync();
    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

    const shutdown = (signal) => {
      console.log(`Received ${signal}, shutting down...`);
      stopAutoSync();
      server.close(() => {
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 3000).unref?.();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
