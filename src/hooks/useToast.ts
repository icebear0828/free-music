import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastState {
  message: string;
  actionText?: string;
  onAction?: () => void;
}

export function useToast(defaultDuration = 4000) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback(
    (next: ToastState, duration = defaultDuration) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(next);
      timer.current = setTimeout(() => setToast(null), duration);
    },
    [defaultDuration]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { toast, show, dismiss };
}
