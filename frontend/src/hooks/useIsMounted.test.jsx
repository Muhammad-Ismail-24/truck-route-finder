import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useIsMounted } from './useIsMounted';
import { getBrowserTimezoneInfo } from '../lib/format/time';

function TestMountedComponent() {
  const isMounted = useIsMounted();
  return <div data-mounted={isMounted}>{isMounted ? 'client-mounted' : 'server-rendered'}</div>;
}

describe('useIsMounted Hook (Section 17 SSR / Hydration Safety)', () => {
  it('returns false during server-side rendering', () => {
    const html = renderToString(<TestMountedComponent />);
    expect(html).toContain('data-mounted="false"');
    expect(html).toContain('server-rendered');
    expect(html).not.toContain('client-mounted');
  });

  it('provides browser timezone info helper resolving offset and name', () => {
    const info = getBrowserTimezoneInfo(new Date('2026-11-01T12:00:00Z'));
    expect(info).toHaveProperty('offset');
    expect(info).toHaveProperty('tzName');
    expect(typeof info.offset).toBe('string');
    expect(typeof info.tzName).toBe('string');
  });
});
