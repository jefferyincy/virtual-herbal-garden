import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';
import { MEDICAL_SYSTEMS, PLANT_PARTS, PREPARATIONS, TOXICITY_LEVELS } from './enums.ts';

const plantSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    commonName: { type: String, required: true, trim: true },
    botanicalName: { type: String, required: true, trim: true },
    family: { type: String, required: true, trim: true, index: true },
    partsUsed: [{ type: String, enum: PLANT_PARTS }],
    preparations: [{ type: String, enum: PREPARATIONS }],
    ailments: [{ type: Schema.Types.ObjectId, ref: 'Ailment' }],
    activeCompounds: [String],
    description: { type: String, default: '' },
    medicinalUses: { type: String, default: '' },
    dosage: { type: String, default: null },
    contraindications: { type: String, default: null },
    toxicity: { type: String, enum: TOXICITY_LEVELS, default: 'none', index: true },
    lookAlikes: [
      {
        _id: false,
        plantId: { type: Schema.Types.ObjectId, ref: 'Plant' },
        note: String,
      },
    ],
    region: [String],
    systemsMentioned: [{ type: String, enum: MEDICAL_SYSTEMS }],
    images: [
      {
        _id: false,
        url: { type: String, required: true },
        alt: { type: String, required: true },
        credit: { type: String, required: true },
      },
    ],
    modelUrl: { type: String, default: null },
    modelScale: { type: Number, default: 1 },
    tags: [String],
    sources: [
      {
        _id: false,
        label: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    verified: { type: Boolean, default: false },
    // Not in the collection list, but required by the kickoff data-honesty rule: a record
    // whose fields are still placeholders must say so, so the UI can mark it unsourced
    // instead of presenting invented data as citable.
    unverified: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Weighted search: the common name is what a visitor types, the botanical name is the
// fallback, tags are the loosest match.
plantSchema.index(
  { commonName: 'text', botanicalName: 'text', tags: 'text' },
  { weights: { commonName: 5, botanicalName: 3, tags: 1 }, name: 'plant_text_search' },
);
plantSchema.index({ region: 1 });

export type PlantDoc = ModelDoc<typeof plantSchema>;
export const Plant = model<PlantDoc>('Plant', plantSchema);
