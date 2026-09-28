/**
 * Validation for the auth and onboarding screens.
 *
 * The rules mirror the server verbatim (server/src/routes/auth.ts: PASSWORD_SCHEMA, register,
 * login, forgot, reset, onboarding) including the message strings, so a field error reads the same
 * whether it came from this form or from a 422. The two modules are kept in sync by hand - there is
 * no shared package between client and server.
 *
 * `@hookform/resolvers` is not a dependency, so no form in this feature passes a resolver to
 * react-hook-form: each submit handler calls `<schema>.safeParse` itself and maps
 * `error.issues[].path[0]` back onto the offending field with `setError`.
 */
import { z } from 'zod';

const EMAIL = z.string().trim().toLowerCase().email('Enter a valid email address');

/** Server rule: minimum 8 characters, at least one digit, at least one non-alphanumeric. */
const PASSWORD = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/\d/, 'Include at least one number')
  .regex(/[^A-Za-z0-9]/, 'Include at least one symbol');

export const loginSchema = z.object({
  email: EMAIL,
  password: z.string().min(1, 'Enter your password'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name must be 80 characters or fewer'),
  email: EMAIL,
  password: PASSWORD,
  /** Client-only: the API never sees this flag, but nothing is created until it is checked. */
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'Accept the safety disclaimer to create an account' }),
  }),
});

export const resetRequestSchema = z.object({ email: EMAIL });

export const resetSchema = z.object({
  token: z.string().min(8, 'Reset token is missing'),
  password: PASSWORD,
});

export const onboardingSchema = z.object({
  interests: z
    .array(z.string().trim().min(1))
    .min(1, 'Pick at least one practice')
    .max(12, 'Pick at most 12 practices'),
  experience: z.enum(['beginner', 'intermediate', 'advanced'], {
    errorMap: () => ({ message: 'Choose your experience level' }),
  }),
  followedPlants: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid plant id'))
    .min(1, 'Follow at least one plant')
    .max(200, 'Follow at most 200 plants'),
});

/**
 * Per-step views of `onboardingSchema`. The wizard gates each step with the same rules the final
 * submit enforces, so the last step cannot fail on a field two screens back.
 */
export const onboardingInterestsSchema = onboardingSchema.pick({ interests: true });
export const onboardingExperienceSchema = onboardingSchema.pick({ experience: true });
export const onboardingPlantsSchema = onboardingSchema.pick({ followedPlants: true });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type ResetInput = z.infer<typeof resetSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;

/**
 * The three requirements the register screen lists under the password field. Order matters: the
 * strength meter reads them in this sequence and the same predicates drive the segment count.
 */
export const PASSWORD_RULES: Array<{ id: string; label: string; test: (value: string) => boolean }> = [
  { id: 'length', label: '8+ characters', test: (value) => value.length >= 8 },
  { id: 'number', label: 'One number', test: (value) => /\d/.test(value) },
  { id: 'symbol', label: 'One symbol', test: (value) => /[^A-Za-z0-9]/.test(value) },
];
