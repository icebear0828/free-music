import { useEffect, useState } from 'react';
import { isNativeMobile } from '../platform/runtime';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Phone-sized viewport, or any native mobile shell regardless of width. */
export function useIsMobile(): boolean {
  const narrow = useMediaQuery('(max-width: 767px)');
  return isNativeMobile || narrow;
}

/** Tablet and below — the desktop table layout stops being usable here. */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}
