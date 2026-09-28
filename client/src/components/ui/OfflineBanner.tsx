import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

export function OfflineBanner(): ReactNode {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 border-b border-warning bg-warning/15 px-4 py-2 text-center text-small text-warning"
    >
      <Icon name="alert-triangle" size={16} />
      You&apos;re offline - changes won&apos;t save
    </div>
  );
}
