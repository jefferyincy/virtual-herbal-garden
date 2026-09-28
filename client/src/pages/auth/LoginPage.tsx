import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { AuthSplitLayout } from '@/features/auth/AuthSplitLayout';
import { apiErrorMessage, issuesToFieldErrors, useLogin } from '@/features/auth/hooks';
import { loginSchema } from '@/features/auth/schemas';

/**
 * Submission validates with `loginSchema.safeParse` and maps `error.issues[].path[0]` onto the
 * field with `setError`, because `@hookform/resolvers` is not a dependency. react-hook-form is
 * therefore not used here at all: `safeParse` plus a `useState` error map is the same behaviour
 * without a resolver library, and the pending flag is the mutation's own `isPending`.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const login = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const from = readFromState(location.state);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    setErrors({});
    login.mutate(parsed.data, {
      onSuccess: () => {
        navigate(from ?? '/garden', { replace: true });
      },
    });
  }

  return (
    <AuthSplitLayout
      title="Welcome back"
      subtitle="Sign in to your garden, your notes and your progress."
      footer={
        <p>
          New here?{' '}
          <Link to="/register" className="text-accent-400 hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {login.isError && <ErrorBanner message={apiErrorMessage(login.error)} />}

        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />

        <PasswordField
          value={password}
          onChange={setPassword}
          error={errors.password}
          visible={showPassword}
          onToggle={() => setShowPassword((prev) => !prev)}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox
            label="Remember me"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <Link to="/reset" className="text-small text-accent-400 hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth loading={login.isPending}>
          Sign in
        </Button>

        <Divider />

        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() =>
            toast.push({
              variant: 'info',
              title: 'Google sign-in is not configured',
              description: 'Use your email and password for now.',
            })
          }
        >
          <GoogleGlyph />
          Continue with Google
        </Button>
      </form>
    </AuthSplitLayout>
  );
}

/**
 * The eye toggle sits in the input's trailing slot. The primitive has no slot prop, so the button
 * is absolutely positioned over an input given `pr-12`; `top-[26px]` is the label box (13px/1.5)
 * plus the container's 6px gap, which aligns a 44px button with the 44px field exactly.
 */
function PasswordField({
  value,
  onChange,
  error,
  visible,
  onToggle,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <Input
        label="Password"
        type={visible ? 'text' : 'password'}
        name="password"
        autoComplete="current-password"
        placeholder="Your password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        className="pr-12"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-0.5 top-[26px] grid h-11 w-11 place-items-center rounded-btn text-fg-muted transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
      >
        <Icon name={visible ? 'eye-off' : 'eye'} size={18} />
      </button>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line-subtle" />
      <span className="mono-label">or</span>
      <span className="h-px flex-1 bg-line-subtle" />
    </div>
  );
}

/**
 * The Google mark is drawn as a single-colour 18px line glyph in `currentColor` - no brand fill, no
 * emoji - because the app ships one icon set and a second colour palette on one button would break
 * it. The button only reports that the provider is unconfigured; it must never fake a session.
 */
function GoogleGlyph() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
      className="text-fg"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M20.5 12H12" />
      <path d="M12 12v7.5" />
    </svg>
  );
}

/** `RequireAccess` sends the blocked path here as `state.from`; anything else falls back to /garden. */
function readFromState(state: unknown): string | null {
  if (!state || typeof state !== 'object' || !('from' in state)) return null;
  const from = state.from;
  return typeof from === 'string' && from.startsWith('/') ? from : null;
}
