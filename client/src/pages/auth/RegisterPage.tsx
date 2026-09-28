import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { AuthSplitLayout } from '@/features/auth/AuthSplitLayout';
import { PasswordStrengthMeter } from '@/features/auth/PasswordStrengthMeter';
import { apiErrorMessage, apiFieldErrors, issuesToFieldErrors, useRegister } from '@/features/auth/hooks';
import { registerSchema } from '@/features/auth/schemas';

/**
 * `registerSchema.safeParse` runs in the submit handler (no `@hookform/resolvers` in this project)
 * and its `issues` become the per-field error map. A 422 from the server is merged over that map
 * so a uniqueness conflict on `email` lands on the email field rather than only in the banner.
 */
export default function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const serverErrors = apiFieldErrors(register.error);
  const fieldError = (field: string): string | undefined => errors[field] ?? serverErrors[field];

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = registerSchema.safeParse({
      name,
      email,
      password,
      acceptedTerms: accepted,
    });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    register.mutate(
      { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password },
      { onSuccess: () => navigate('/onboarding', { replace: true }) },
    );
  }

  return (
    <AuthSplitLayout
      mirrored
      title="Create your garden"
      subtitle="One account, then the garden and the whole encyclopedia."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/login" className="text-accent-400 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {register.isError && <ErrorBanner message={apiErrorMessage(register.error)} />}

        <Input
          label="Name"
          name="name"
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldError('name')}
        />

        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldError('email')}
        />

        <div className="flex flex-col gap-2">
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="Choose a password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldError('password')}
          />
          {/* The meter lists the three requirements itself, so they are not repeated as copy. */}
          <PasswordStrengthMeter value={password} />
        </div>

        <Checkbox
          label={
            <span className="text-small text-fg-secondary">
              I accept the{' '}
              <Link to="/about#disclaimer" className="text-accent-400 hover:underline">
                safety disclaimer
              </Link>{' '}
              and understand this garden is an educational reference, not medical advice.
            </span>
          }
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          error={fieldError('acceptedTerms')}
        />

        <Button type="submit" fullWidth loading={register.isPending}>
          Create account
        </Button>
      </form>
    </AuthSplitLayout>
  );
}
