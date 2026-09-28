import type { HydratedDocument, InferSchemaType, Types } from 'mongoose';

/**
 * Every model's document type must expose `_id`, because `InferSchemaType` returns only the
 * declared paths - mongoose adds `_id` (and `__v`) at runtime, so the raw inference is missing a
 * field that genuinely exists on every document and on every lean result.
 *
 * `ModelDoc<Schema>` re-attaches it, typed as `ObjectId` because every collection in this project
 * uses the default ObjectId primary key, so callers get a usable id without a cast:
 *
 *     export const User = model<ModelDoc<typeof userSchema>>('User', userSchema);
 *     export type UserDoc = ModelDoc<typeof userSchema>;
 *
 * `Created<T>` is the hydration helper for create paths: `const doc: Created<UserDoc> = await User.create(...)`.
 */
export type ModelDoc<S> = InferSchemaType<S> & { _id: Types.ObjectId };

export type Created<D> = HydratedDocument<D>;
