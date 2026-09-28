/**
 * Shared shell for the four auth screens.
 *
 * Desktop is a two-column split: a 45% illustration panel and the form column, both full height.
 * Below `lg` the illustration is hidden entirely and only the form column remains, so a small
 * viewport gets one centred column instead of a squeezed split. `mirrored` moves the illustration
 * to the right for registration.
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { Chip } from '@/components/ui/Chip';
import { Watermark } from '@/components/ui/Watermark';
import { cn } from '@/lib/cn';

/**
 * Botanical line-art composition: the app's own line glyphs scattered around the panel at low
 * opacity. Positions are percentages of the composition box so the arrangement scales with it.
 */
const GLYPHS: Array<{ name: IconName; size: number; position: string; tone: string }> = [
  { name: 'leaf', size: 132, position: 'left-[30%] top-[26%]', tone: 'text-accent-400 opacity-20' },
  { name: 'sun', size: 44, position: 'left-[64%] top-[18%]', tone: 'text-fg opacity-[0.14]' },
  { name: 'moon', size: 34, position: 'left-[12%] top-[26%]', tone: 'text-fg opacity-[0.12]' },
  { name: 'rain', size: 40, position: 'left-[20%] top-[64%]', tone: 'text-fg opacity-[0.14]' },
  { name: 'mist', size: 56, position: 'left-[52%] top-[68%]', tone: 'text-fg opacity-[0.12]' },
  { name: 'sparkles', size: 30, position: 'left-[76%] top-[52%]', tone: 'text-accent-400 opacity-[0.24]' },
  { name: 'compass', size: 30, position: 'left-[36%] top-[6%]', tone: 'text-fg opacity-[0.12]' },
  { name: 'hexagon', size: 64, position: 'left-[8%] top-[46%]', tone: 'text-fg opacity-[0.08]' },
  { name: 'flame', size: 28, position: 'left-[84%] top-[30%]', tone: 'text-fg opacity-[0.10]' },
  { name: 'globe', size: 34, position: 'left-[62%] top-[86%]', tone: 'text-fg opacity-[0.10]' },
];

export function AuthSplitLayout({
  title,
  subtitle,
  children,
  footer,
  mirrored = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Registration mirrors the illustration onto the right-hand side. */
  mirrored?: boolean;
}): ReactNode {
  return (
    <div className="flex min-h-screen flex-col bg-bg-base lg:flex-row">
      <Panel mirrored={mirrored} />

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <h1 className="text-h1 text-fg">{title}</h1>
          {subtitle && <p className="mt-2 text-body text-fg-secondary">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          <div className="mt-8 flex flex-col gap-4">
            <Chip tone="clay" size="sm" className="self-start">
              NOT MEDICAL ADVICE
            </Chip>
            {footer && <div className="text-small text-fg-secondary">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ mirrored }: { mirrored: boolean }): ReactNode {
  return (
    <aside
      className={cn(
        'relative hidden overflow-hidden bg-bg-sunken lg:flex lg:w-[45%] lg:shrink-0',
        mirrored ? 'lg:order-last lg:border-l' : 'lg:border-r',
        'border-line-subtle',
      )}
    >
      <div aria-hidden="true" className="accent-halo pointer-events-none absolute inset-0" />

      <div className="relative z-10 flex h-full w-full flex-col justify-between gap-10 p-12">
        <p className="font-serif text-h3 italic text-fg">Virtual Herbal Garden</p>

        <div className="relative h-[320px]" aria-hidden="true">
          <Watermark name="leaf" size={320} className="opacity-[0.07]" />
          {GLYPHS.map((glyph) => (
            <Icon
              key={glyph.name}
              name={glyph.name}
              size={glyph.size}
              className={cn('absolute', glyph.position, glyph.tone)}
            />
          ))}
        </div>

        <p className="max-w-reading text-body-lg text-fg-secondary">
          Walk through a garden. Learn every plant.
        </p>
      </div>
    </aside>
  );
}
