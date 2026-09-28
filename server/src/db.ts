import mongoose from 'mongoose';
import { env } from './config/env.ts';

/** Connect to MongoDB. Called once from the server bootstrap. */
export async function connectDb(uri: string = env.MONGO_URI): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  // Deterministic index creation is required by the spec (unique slugs, compound keys).
  mongoose.set('autoIndex', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function dbState(): string {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting', 'unknown'];
  return states[mongoose.connection.readyState] ?? 'unknown';
}
