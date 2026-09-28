import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { cn } from '@/lib/cn';

const HEX_CLIP = 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)';

export function HexBadgeTile({
  name,
  icon,
  unlocked,
  size = 72,
  description,
  className,
}: {
  name: string;
  icon: string;
  unlocked: boolean;
  size?: number;
  description?: string;
  className?: string;
}): ReactNode {
  /* clip-path cuts the border box, so the accent edge is a filled hexagon behind the face. */
  const edge: CSSProperties = { clipPath: HEX_CLIP, width: size, height: size };
  const face: CSSProperties = { clipPath: HEX_CLIP, width: size - 2, height: size - 2 };

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div
        role="img"
        aria-label={`${name} badge, ${unlocked ? 'unlocked' : 'locked'}`}
        title={description}
        style={edge}
        className={cn(
          'flex items-center justify-center',
          unlocked ? 'bg-accent-600 shadow-l4' : 'bg-line-subtle',
        )}
      >
        <div
          style={face}
          className={cn('relative flex items-center justify-center', unlocked ? 'bg-accent-tint' : 'bg-bg-surface')}
        >
          <span className={cn('flex items-center justify-center', !unlocked && 'opacity-30')}>
            <Icon
              name={icon as IconName}
              size={Math.round(size * 0.34)}
              className={unlocked ? 'text-accent-400' : 'text-fg-muted'}
            />
          </span>
          {!unlocked && (
            <span className="absolute right-[14%] top-[52%] text-fg-muted">
              <Icon name="lock" size={14} />
            </span>
          )}
        </div>
      </div>
      <span className={cn('text-small', unlocked ? 'text-fg' : 'text-fg-muted')}>{name}</span>
    </div>
  );
}

export function HexBadgeRow({
  badges,
  max,
  className,
}: {
  badges: Array<{ key: string; name: string; icon: string; earnedAt?: string }>;
  max?: number;
  className?: string;
}): ReactNode {
  const visible = typeof max === 'number' ? badges.slice(0, max) : badges;
  return (
    <div className={cn('flex flex-wrap items-start gap-4', className)}>
      {visible.map((badge) => (
        <HexBadgeTile
          key={badge.key}
          name={badge.name}
          icon={badge.icon}
          unlocked={Boolean(badge.earnedAt)}
        />
      ))}
    </div>
  );
}
