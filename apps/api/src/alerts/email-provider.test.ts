import { describe, expect, it, vi } from 'vitest';
import { LogOnlyEmailProvider } from './email-provider.js';

describe('LogOnlyEmailProvider', () => {
  it('resolves without throwing and logs the message instead of sending it', async () => {
    const provider = new LogOnlyEmailProvider();
    const logSpy = vi.spyOn(provider['logger'], 'log').mockImplementation(() => undefined);

    await expect(
      provider.send({ to: 'jane@example.com', subject: 'New matches', text: 'Body text' }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('jane@example.com');
    expect(logged).toContain('New matches');
    expect(logged).toContain('Body text');
    expect(logged).toContain('not-sent');
  });
});
