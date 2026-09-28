import { PlayerProvider } from './components/PlayerProvider';
import { FloatingLyricsProvider } from './components/FloatingLyricsProvider';
import { AppDataProvider } from './components/AppDataProvider';
import { DesktopShell } from './components/desktop/DesktopShell';
import { MobileShell } from './components/mobile/MobileShell';
import { useIsMobile } from './hooks/useMediaQuery';

function Shell() {
  return useIsMobile() ? <MobileShell /> : <DesktopShell />;
}

export default function App() {
  return (
    <PlayerProvider>
      <FloatingLyricsProvider>
        <AppDataProvider>
          <Shell />
        </AppDataProvider>
      </FloatingLyricsProvider>
    </PlayerProvider>
  );
}
