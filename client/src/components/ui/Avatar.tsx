import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Avatar({
  name,
  src,
  level,
  size = 36,
  active = false,
  className,
}: {
  name: string;
  src?: string;
  level?: number;
  size?: number;
  active?: boolean;
  className?: string;
}): ReactNode {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-line-strong bg-bg-raised font-medium text-fg',
        typeof level === 'number' && 'border-accent-600',
        active && 'ring-2 ring-accent-glow',
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name} width={size} height={size} className="size-full object-cover" />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.42) }}>{initial}</span>
      )}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 32,
  className,
}: {
  people: Array<{ name: string; src?: string }>;
  max?: number;
  size?: number;
  className?: string;
}): ReactNode {
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  return (
    <span className={cn('inline-flex items-center', className)}>
      {visible.map((person, index) => (
        <span key={`${person.name}-${index}`} className={index === 0 ? undefined : '-ml-2'}>
          <Avatar name={person.name} src={person.src} size={size} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          style={{ width: size, height: size }}
          className="-ml-2 inline-flex items-center justify-center rounded-full border border-line-strong bg-bg-hover font-mono text-[10px] text-fg-secondary"
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
