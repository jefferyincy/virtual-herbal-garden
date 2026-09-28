import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';
import { AILMENT_SYSTEMS } from './enums.ts';

const ailmentSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    system: { type: String, enum: AILMENT_SYSTEMS, required: true, index: true },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

export type AilmentDoc = ModelDoc<typeof ailmentSchema>;
export const Ailment = model<AilmentDoc>('Ailment', ailmentSchema);
