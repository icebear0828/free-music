import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { setTestViewportWidth } from './test/setup';

function stubNetwork() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    })
  );
  // localforage backs downloads; jsdom has no IndexedDB, so keep it quiet.
  vi.stubGlobal('EventSource', class {});
}

describe('App shell selection', () => {
  beforeEach(() => {
    localStorage.clear();
    stubNetwork();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setTestViewportWidth(1280);
  });

  it('renders the desktop sidebar on a wide viewport', async () => {
    setTestViewportWidth(1280);
    render(<App />);
    expect(await screen.findByText('发现音乐')).toBeInTheDocument();
    expect(screen.getByText('设置 · 悬浮歌词')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toHaveTextContent('音乐库');
  });

  it('renders the mobile tab bar on a narrow viewport', async () => {
    setTestViewportWidth(390);
    render(<App />);
    expect(await screen.findByText('音乐库')).toBeInTheDocument();
    expect(screen.getByText('下载')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索歌曲、歌手、专辑')).toBeInTheDocument();
    expect(screen.queryByText('发现音乐')).not.toBeInTheDocument();
  });

  it('navigates to settings from the mobile shell and exposes floating lyrics', async () => {
    setTestViewportWidth(390);
    render(<App />);

    await userEvent.click(await screen.findByText('我的'));
    await userEvent.click(screen.getByLabelText('设置'));

    await waitFor(() => expect(screen.getByText('悬浮歌词')).toBeInTheDocument());
    expect(screen.getByText('开启悬浮歌词')).toBeInTheDocument();
    // No Document Picture-in-Picture in jsdom, so the switch reports unsupported.
    expect(screen.getByRole('switch', { name: '开启悬浮歌词' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: '显示翻译' })).toBeEnabled();
  });
});
