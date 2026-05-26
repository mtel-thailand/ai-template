import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  verifyEmbedderIntegrity,
  verifyExtensionIntegrity,
  detectPlatform,
  IntegrityVerificationError,
} from './integrity-verifier.js';

function withTempLock(contents: string, fn: (path: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'integrity-test-'));
  const lockPath = join(dir, 'test.lock');
  writeFileSync(lockPath, contents, 'utf-8');
  return fn(lockPath);
}

function withTempFile(contents: string, fn: (path: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'integrity-test-'));
  const filePath = join(dir, 'target.bin');
  writeFileSync(filePath, contents, 'utf-8');
  return fn(filePath);
}

describe('detectPlatform', () => {
  it('returns a non-empty string', () => {
    const platform = detectPlatform();
    expect(platform).toBeTruthy();
    expect(typeof platform).toBe('string');
  });

  it('returns a known pattern like <os>-<arch>', () => {
    const platform = detectPlatform();
    expect(platform).toMatch(/^[a-z]+-[a-z0-9_]+$/);
  });
});

describe('verifyEmbedderIntegrity', () => {
  it('returns ok:true when SHA matches', async () => {
    const content = 'exact model weights content';
    await withTempFile(content, async (filePath) => {
      // Compute the correct SHA for this content
      const { createHash } = await import('crypto');
      const hash = createHash('sha256').update(content).digest('hex');

      await withTempLock(
        `${hash}  ${filePath}\n`,
        async (lockPath) => {
          const result = await verifyEmbedderIntegrity(lockPath, filePath);
          expect(result.ok).toBe(true);
          expect(result.message).toContain('SHA-256 matches');
        },
      );
    });
  });

  it('returns ok:false when SHA does not match', async () => {
    const content = 'exact model weights content';
    await withTempFile(content, async (filePath) => {
      await withTempLock(
        // Deliberately wrong SHA
        `${'0'.repeat(64)}  ${filePath}\n`,
        async (lockPath) => {
          const result = await verifyEmbedderIntegrity(lockPath, filePath);
          expect(result.ok).toBe(false);
          expect(result.message).toContain('SHA-256 mismatch');
        },
      );
    });
  });

  it('returns ok:false when target file does not exist', async () => {
    await withTempLock(
      `${'0'.repeat(64)}  /nonexistent/path/weights.onnx\n`,
      async (lockPath) => {
        const result = await verifyEmbedderIntegrity(
          lockPath,
          '/nonexistent/path/weights.onnx',
        );
        expect(result.ok).toBe(false);
        expect(result.message).toContain('Failed to read or hash');
      },
    );
  });

  it('returns ok:false when lock file does not contain the target', async () => {
    await withTempFile('some content', async (filePath) => {
      await withTempLock(
        `${'0'.repeat(64)}  another-model.onnx\n`,
        async (lockPath) => {
          const result = await verifyEmbedderIntegrity(lockPath, filePath);
          expect(result.ok).toBe(false);
          expect(result.message).toContain('No lock entry found');
        },
      );
    });
  });

  it('ignores comment lines and blank lines in lock file', async () => {
    const content = 'model weights';
    await withTempFile(content, async (filePath) => {
      const { createHash } = await import('crypto');
      const hash = createHash('sha256').update(content).digest('hex');

      await withTempLock(
        `# This is a comment line\n\n${hash}  ${filePath}\n\n# Another comment\n`,
        async (lockPath) => {
          const result = await verifyEmbedderIntegrity(lockPath, filePath);
          expect(result.ok).toBe(true);
        },
      );
    });
  });

  it('fail-closed when lock file is malformed', async () => {
    await withTempLock(
      'not-a-sha-entry\n',
      async (lockPath) => {
        const result = await verifyEmbedderIntegrity(lockPath, '/some/path');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('No lock entry found');
      },
    );
  });

  it('fail-closed when lock file is empty', async () => {
    await withTempLock(
      '',
      async (lockPath) => {
        const result = await verifyEmbedderIntegrity(lockPath, '/some/path');
        expect(result.ok).toBe(false);
      },
    );
  });
});

describe('verifyExtensionIntegrity', () => {
  it('returns ok:true when SHA matches for the current platform', async () => {
    const content = 'extension binary';
    const platform = detectPlatform();
    await withTempFile(content, async (filePath) => {
      const { createHash } = await import('crypto');
      const hash = createHash('sha256').update(content).digest('hex');

      // Lock entry target must match the platform key, not the file path
      await withTempLock(
        `${hash}  ${platform}\n`,
        async (lockPath) => {
          const result = await verifyExtensionIntegrity(lockPath, filePath);
          expect(result.ok).toBe(true);
          expect(result.message).toContain('SHA-256 matches');
        },
      );
    });
  });

  it('returns ok:false when SHA does not match', async () => {
    const content = 'exact model weights content';
    await withTempFile(content, async (filePath) => {
      await withTempLock(
        // Deliberately wrong SHA
        `${'0'.repeat(64)}  ${filePath}\n`,
        async (lockPath) => {
          const result = await verifyEmbedderIntegrity(lockPath, filePath);
          expect(result.ok).toBe(false);
          expect(result.message).toContain('SHA-256 mismatch');
        },
      );
    });
  });

  it('returns ok:false when target file does not exist', async () => {
    await withTempLock(
      `${'0'.repeat(64)}  weights.onnx\n`,
      async (lockPath) => {
        const result = await verifyEmbedderIntegrity(
          lockPath,
          '/nonexistent/path/weights.onnx',
        );
        expect(result.ok).toBe(false);
        expect(result.message).toContain('Failed to read or hash');
      },
    );
  });

  it('returns ok:false when lock file does not contain the target', async () => {
    await withTempFile('some content', async (filePath) => {
      await withTempLock(
        `${'0'.repeat(64)}  another-model.onnx\n`,
        async (lockPath) => {
          const result = await verifyEmbedderIntegrity(lockPath, filePath);
          expect(result.ok).toBe(false);
          expect(result.message).toContain('No lock entry found');
        },
      );
    });
  });

  it('ignores comment lines and blank lines in lock file', async () => {
    const content = 'model weights';
    await withTempFile(content, async (filePath) => {
      const { createHash } = await import('crypto');
      const hash = createHash('sha256').update(content).digest('hex');

      await withTempLock(
        `# This is a comment line\n\n${hash}  ${filePath}\n\n# Another comment\n`,
        async (lockPath) => {
          const result = await verifyEmbedderIntegrity(lockPath, filePath);
          expect(result.ok).toBe(true);
        },
      );
    });
  });

  it('fail-closed when lock file is malformed', async () => {
    await withTempLock(
      'not-a-sha-entry\n',
      async (lockPath) => {
        const result = await verifyEmbedderIntegrity(lockPath, '/some/path');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('No lock entry found');
      },
    );
  });

  it('returns ok:false when SHA does not match', async () => {
    const platform = detectPlatform();
    await withTempFile('extension binary', async (filePath) => {
      await withTempLock(
        `${'0'.repeat(64)}  ${platform}\n`,
        async (lockPath) => {
          const result = await verifyExtensionIntegrity(lockPath, filePath);
          expect(result.ok).toBe(false);
          expect(result.message).toContain('SHA-256 mismatch');
        },
      );
    });
  });

  it('returns ok:false when extension file does not exist', async () => {
    const platform = detectPlatform();
    await withTempLock(
      `${'0'.repeat(64)}  ${platform}\n`,
      async (lockPath) => {
        const result = await verifyExtensionIntegrity(
          lockPath,
          '/nonexistent/vec.so',
        );
        expect(result.ok).toBe(false);
        expect(result.message).toContain('Failed to read or hash');
      },
    );
  });

  it('returns ok:false when no entry exists for the target platform', async () => {
    await withTempFile('binary', async (filePath) => {
      await withTempLock(
        `${'0'.repeat(64)}  different-platform\n`,
        async (lockPath) => {
          const result = await verifyExtensionIntegrity(lockPath, filePath);
          expect(result.ok).toBe(false);
          expect(result.message).toContain('No lock entry found');
        },
      );
    });
  });
});

describe('IntegrityVerificationError', () => {
  it('has the correct error code', () => {
    const err = new IntegrityVerificationError('test message');
    expect(err.code).toBe('INTEGRITY_VERIFICATION_ERROR');
    expect(err.message).toBe('test message');
    expect(err.name).toBe('IntegrityVerificationError');
  });
});
