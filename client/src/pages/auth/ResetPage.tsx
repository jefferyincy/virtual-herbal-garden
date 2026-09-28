import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

import { PasswordStrengthMeter } from '@/features/auth/PasswordStrengthMeter';
import {
  apiErrorMessage,
  apiFieldErrors,
  issuesToFieldErrors,
  useForgotPassword,
  useResetPassword,
} from '@/features/auth/hooks';
import { resetRequestSchema, resetSchema } from '@/features/auth/schemas';

/** The mockup's countdown starts at 0:42. */
const RESEND_SECONDS = 42;

/** `m:ss` with a bare minute, matching the mockup's "Resend in 0:42". */
function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * Two flows share this route, chosen by the presence of `?token=`:
 *   - no token  -> request a reset link, then the "check your inbox" state
 *   - token     -> choose a new password with that token
 *
 * Validation runs through `resetRequestSchema` / `resetSchema` with `safeParse` in the submit
 * handler, because `@hookform/resolvers` is not installed in this project.
 */
export default function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  return <ResetCard key={token ?? 'request'} token={token} />;
}

function ResetCard({ token }: { token: string | null }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg-base px-4 py-12">
      <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-[440px]">
        <Card variant="raised" padding="lg">
          {token ? <ChoosePasswordForm token={token} /> : <RequestForm />}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ state one: request */

function RequestForm() {
  const forgot = useForgotPassword();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = resetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    forgot.mutate(parsed.data, {
      onSuccess: () => setSubmittedEmail(parsed.data.email),
    });
  }

  if (submittedEmail !== null) {
    return (
      <SuccessState
        email={submittedEmail}
        devToken={import.meta.env.DEV ? forgot.data?.devToken : undefined}
        onUseToken={(devToken) => navigate(`/reset?token=${encodeURIComponent(devToken)}`)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-h2 text-fg">Reset your password</h2>
        <p className="text-body text-fg-secondary">
          Enter the email on your account and we will send you a reset link.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {forgot.isError && <ErrorBanner message={apiErrorMessage(forgot.error)} />}

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

        <Button type="submit" fullWidth loading={forgot.isPending}>
          Send reset link
        </Button>
      </form>

      <BackToSignIn />
    </div>
  );
}

/**
 * The success state. The countdown is the only thing on this card that changes by itself, so the
 * resend action appears exactly when the chip expires rather than being disabled behind a tooltip.
 */
function SuccessState({
  email,
  devToken: initialDevToken,
  onUseToken,
}: {
  email: string;
  devToken?: string;
  onUseToken: (token: string) => void;
}) {
  const forgot = useForgotPassword();
  const [remaining, setRemaining] = useState(RESEND_SECONDS);
  const [devToken, setDevToken] = useState(initialDevToken);

  useEffect(() => {
    if (remaining <= 0) return;
    // A single one-second timeout chained off the current value: StrictMode's double-invoked
    // effects then only schedule, never decrement twice.
    const timer = setTimeout(() => setRemaining((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  function resend(): void {
    setRemaining(RESEND_SECONDS);
    // Each request issues a fresh single-use token, so a resend must replace the old dev token.
    setDevToken(undefined);
    forgot.mutate({ email }, { onSuccess: (data) => setDevToken(data.devToken) });
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-accent-tint">
        <Icon name="mail" size={26} className="text-accent-400" />
      </span>

      <header className="flex flex-col gap-2">
        <h2 className="text-h2 text-fg">Check your inbox</h2>
        <p className="text-body text-fg-secondary">
          We sent a reset link to <span className="text-fg">{email}</span>. It expires in 30 minutes.
        </p>
      </header>

      {forgot.isError && <ErrorBanner message={apiErrorMessage(forgot.error)} className="w-full" />}

      {remaining > 0 ? (
        <Chip tone="neutral" size="md">
          Resend in {formatCountdown(remaining)}
        </Chip>
      ) : (
        <Button variant="ghost" size="sm" loading={forgot.isPending} onClick={resend}>
          Resend
        </Button>
      )}

      {/*
        Development only. The API returns `devToken` when `!isProd` because no mail provider is
        wired up; this affordance must disappear with that branch once mail delivery exists.
      */}
      {devToken && (
        <div className="flex w-full flex-col items-start gap-2 rounded-card border border-line-subtle bg-bg-surface p-3 text-left">
          <span className="mono-label">dev token · {devToken.slice(0, 16)}…</span>
          <Button variant="secondary" size="sm" onClick={() => onUseToken(devToken)}>
            Use this token
          </Button>
        </div>
      )}

      <BackToSignIn />
    </div>
  );
}

/* ------------------------------------------------------------------ state two: choose password */

function ChoosePasswordForm({ token }: { token: string }) {
  const reset = useResetPassword();
  const toast = useToast();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = resetSchema.safeParse({ token, password });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    reset.mutate(parsed.data, {
      onSuccess: () => {
        toast.push({
          variant: 'success',
          title: 'Password updated',
          description: 'Sign in with your new password.',
        });
        navigate('/login', { replace: true });
      },
    });
  }

  const serverErrors = apiFieldErrors(reset.error);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-h2 text-fg">Choose a new password</h2>
        <p className="text-body text-fg-secondary">
          Setting a new password signs out every other session.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {reset.isError && <ErrorBanner message={apiErrorMessage(reset.error)} />}

        <div className="flex flex-col gap-2">
          <Input
            label="New password"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="Choose a password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password ?? serverErrors.password}
          />
          <PasswordStrengthMeter value={password} />
        </div>

        {/* The token travels with the form, not as visible text: it came from the emailed link. */}
        <input type="hidden" name="token" value={token} readOnly />

        <Button type="submit" fullWidth loading={reset.isPending}>
          Update password
        </Button>
      </form>

      <BackToSignIn />
    </div>
  );
}

function BackToSignIn() {
  return (
    <Link
      to="/login"
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-btn text-body text-fg-secondary transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
    >
      Back to sign in
    </Link>
  );
}
