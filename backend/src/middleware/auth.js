import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set in environment variables");
  }
  return secret;
}

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role || "user"
    };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

/** After requireAuth: block accounts pending admin approval (signupApproved === false). */
export async function requireApprovedUser(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ message: "Authentication required" });
  }
  try {
    const user = await User.findById(req.user.id).select("signupApproved").lean();
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (user.signupApproved === false) {
      return res.status(403).json({ message: "Account pending administrator approval" });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: "Authorization check failed", error: error.message });
  }
}
