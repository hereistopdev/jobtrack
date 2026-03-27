import serverless from "serverless-http";
import app from "../backend/src/app.js";
import { connectDB } from "../backend/src/config/db.js";

let handler;

export default async function vercelHandler(req, res) {
  await connectDB();
  if (!handler) {
    handler = serverless(app);
  }
  return handler(req, res);
}
