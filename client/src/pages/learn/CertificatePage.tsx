import { Link, useParams } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { HexBadgeTile } from '@/components/ui/HexBadgeTile';
import { Skeleton } from '@/components/ui/Skeleton';
import { Watermark } from '@/components/ui/Watermark';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/stores/session';
import { formatDate } from '@/lib/format';

const COURSE_NAME = 'Medicinal Plant Fundamentals';

/**
 * Deterministic verification code: the same certificate id must always print the same code, and
 * there is no server endpoint for it. A 32-bit FNV-1a over the id keeps it stable across renders,
 * reloads and devices without storing anything.
 */
function verificationCode(id: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const digits = String(hash % 1_000_000_000).padStart(9, '0');
  return `VHG-${new Date().getFullYear()}-${digits.slice(0, 5)}`;
}

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const { push } = useToast();

  const certificateId = id ?? 'unknown';
  const code = verificationCode(certificateId);

  const share = async () => {
    const url = `${window.location.origin}/certificate/${encodeURIComponent(certificateId)}`;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      push({ variant: 'success', title: 'Link copied', description: url });
    } catch {
      push({
        variant: 'warning',
        title: 'Could not copy the link',
        description: 'Copy the URL from the address bar to share this certificate.',
      });
    }
  };

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading certificate" className="mx-auto w-full max-w-content py-10">
        <div className="mx-auto max-w-[1000px]">
          <Skeleton variant="card" height={620} />
        </div>
      </div>
    );
  }

  // A certificate is issued to a named learner, so without a session there is nothing to print.
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-reading py-16">
        <ErrorState
          title="Sign in to view this certificate"
          message="Certificates are issued to the learner who completed the course."
        >
          <Link
            to="/login"
            className="inline-flex h-11 items-center justify-center rounded-btn bg-accent-500 px-4 font-semibold text-fg-onAccent transition-colors duration-100 ease-base hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            Sign in
          </Link>
        </ErrorState>
      </div>
    );
  }

  // The guard above proves `user` is present, so the name is safe to read here.
  const learnerName = user.name;

  return (
    <div className="mx-auto w-full max-w-content py-10">
      <div className="mx-auto max-w-[1000px]">
        <Card
          variant="flat"
          padding="none"
          className="relative overflow-hidden border-accent-600 bg-bg-base shadow-l1"
        >
          <span
            aria-hidden="true"
            className="accent-halo pointer-events-none absolute -right-32 -top-32 size-96 rounded-full"
          />
          <Watermark name="leaf" size={420} />

          {/* Inner hairline frame: the printed border inside the card edge. */}
          <div className="relative m-4 aspect-[297/210] border border-line-subtle p-10 sm:p-14">
            <p className="mono-label">Virtual Herbal Garden</p>

            <div className="mt-10 flex flex-col items-center text-center">
              <h1 className="text-display text-fg">Certificate of Completion</h1>
              <p className="mt-6 text-body text-fg-secondary">awarded to</p>
              <p className="mt-3 font-serif text-[44px] italic leading-tight text-fg">
                {learnerName}
              </p>
              <p className="mt-6 text-h3 text-fg">{COURSE_NAME}</p>
              <p className="mono-label mt-4">
                Issued {formatDate(new Date().toISOString())} · {code}
              </p>
            </div>

            <div className="absolute bottom-10 left-10 sm:bottom-14 sm:left-14">
              <HexBadgeTile name="Course complete" icon="award" unlocked size={72} />
            </div>

            <div className="absolute bottom-10 right-10 flex flex-col items-end sm:bottom-14 sm:right-14">
              <span className="font-serif text-h2 italic text-fg-secondary">Virtual Herbal Garden</span>
              <span className="mt-1 block h-px w-48 bg-line-strong" />
              <span className="mono-label mt-2">Programme director</span>
            </div>
          </div>
        </Card>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {/* No PDF library is installed and faking a PDF would produce an unopenable file, so
              the print dialog is the honest zero-dependency export: the browser's own Save-as-PDF. */}
          <Button iconLeft="download" onClick={() => window.print()}>
            Download PDF
          </Button>
          <Button variant="secondary" iconLeft="share" onClick={() => void share()}>
            Share
          </Button>
        </div>

        <p className="mt-4 flex items-center justify-center gap-2 text-small text-fg-muted">
          <Icon name="info" size={14} />
          There is no PDF library in this project, so Download PDF opens the browser print dialog -
          a real Save-as-PDF, not a generated file.
        </p>
      </div>
    </div>
  );
}
