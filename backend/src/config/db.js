import mongoose from "mongoose";

const globalForMongoose = globalThis;

/**
 * Reuse Mongoose connection across serverless invocations (Vercel / Lambda).
 */
export async function connectDB() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined in environment variables");
  }

  if (globalForMongoose.mongooseConn?.readyState === 1) {
    return globalForMongoose.mongooseConn;
  }

  if (globalForMongoose.mongoosePromise) {
    await globalForMongoose.mongoosePromise;
    return mongoose.connection;
  }

  const opts = {
    maxPoolSize: 5,
    // Stay under Vercel’s function limit (often 10s on Hobby) so we fail fast instead of hanging
    serverSelectionTimeoutMS: 6000,
    connectTimeoutMS: 6000,
    socketTimeoutMS: 45000,
    // Avoid long IPv6 fallback delays between some hosts and Atlas
    family: 4
  };

  globalForMongoose.mongoosePromise = mongoose
    .connect(mongoUri, opts)
    .then((m) => {
      globalForMongoose.mongooseConn = m.connection;
      console.log("MongoDB connected");
      return m.connection;
    })
    .catch((err) => {
      globalForMongoose.mongoosePromise = undefined;
      throw err;
    });

  await globalForMongoose.mongoosePromise;
  return mongoose.connection;
}
