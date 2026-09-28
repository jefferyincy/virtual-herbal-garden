import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';
import { PLOT_STAGES } from './enums.ts';

// _id stays on so the API can address a single plot: DELETE /gardens/:id/plots/:plotId.
const plotSchema = new Schema(
  {
    x: { type: Number, required: true },
    z: { type: Number, required: true },
    plantId: { type: Schema.Types.ObjectId, ref: 'Plant', required: true },
    plantedAt: { type: Date, default: Date.now },
    stage: { type: String, enum: PLOT_STAGES, default: 'seedling' },
  },
  { _id: true },
);

const gardenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    isPublic: { type: Boolean, default: false, index: true },
    plots: {
      type: [plotSchema],
      default: [],
      validate: {
        validator(plots: { x: number; z: number }[]): boolean {
          const seen = new Set<string>();
          for (const plot of plots) {
            const tile = `${plot.x}:${plot.z}`;
            if (seen.has(tile)) return false;
            seen.add(tile);
          }
          return true;
        },
        message: 'two plants cannot occupy the same garden tile',
      },
    },
    lastVisitedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

gardenSchema.index({ userId: 1, createdAt: -1 });

export type GardenDoc = ModelDoc<typeof gardenSchema>;
export const Garden = model<GardenDoc>('Garden', gardenSchema);
