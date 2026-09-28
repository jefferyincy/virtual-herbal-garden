/**
 * Live password strength readout for the register and reset forms.
 *
 * Four segments are driven by PASSWORD_RULES plus a length bonus (14+ characters fills the fourth
 * segment). The mono word - WEAK / FAIR / STRONG - is the accessible signal that carries the
 * meaning; the green fill only reinforces it, so colour is never the only cue.
 */
import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { PASSWORD_RULES } from '@/features/auth/schemas';

const SEGMENTS = 4;
const BONUS_LENGTH = 14;

type Strength = 'WEAK' | 'FAIR' | 'STRONG';

type Assessment = {
  /** 0..SEGMENTS */
  filled: number;
  word: Strength;
  passed: boolean[];
};

function assess(value: string): Assessment {
  const passed = PASSWORD_RULES.map((rule) => rule.test(value));
  const rulesMet = passed.filter(Boolean).length;
  const bonus = value.length >= BONUS_LENGTH ? 1 : 0;
  const filled = Math.min(SEGMENTS, rulesMet + bonus);

  let word: Strength = 'WEAK';
  if (rulesMet === PASSWORD_RULES.length && bonus === 1) word = 'STRONG';
  else if (rulesMet >= 2) word = 'FAIR';

  return { filled, word, passed };
}

export function PasswordStrengthMeter({ value }: { value: string }): ReactNode {
  const { filled, word, passed } = assess(value);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {Array.from({ length: SEGMENTS }, (_, index) => (
            <span
              key={index}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-[180ms] ease-base',
                index < filled ? 'bg-accent-500' : 'bg-white/[0.06]',
              )}
            />
          ))}
        </div>
        <span className="mono-label text-fg-secondary" aria-live="polite">
          {word}
        </span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {PASSWORD_RULES.map((rule, index) => {
          const met = passed[index] ?? false;
          return (
            <li key={rule.id} className="flex items-center gap-1.5">
              <Icon
                name="check"
                size={14}
                strokeWidth={2.5}
                className={met ? 'text-accent-400' : 'text-fg-disabled'}
              />
              <span className={cn('mono-label', met ? 'text-fg-secondary' : 'text-fg-muted')}>
                {rule.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
