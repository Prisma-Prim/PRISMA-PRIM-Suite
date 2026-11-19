import type { Page } from '@playwright/test';

const installed = new WeakSet<Page>();

/** Install before App boot so its synthetic identity captures the native token gate. */
export async function installNativeReadHolds(page: Page) {
  if (installed.has(page)) return;
  await page.addInitScript(() => {
    let path = '';
    const original = Response.prototype.json;
    let stage = '',
      held = false;
    let release: (() => void) | undefined;
    let completion: Promise<unknown> | undefined;
    function pause<T>(value: T) {
      held = true;
      completion = new Promise<void>((resolve) => {
        release = resolve;
      }).then(() => value);
      return completion.then(() => value);
    }
    Object.defineProperty(window, '__prismaLocalDemoTokenGate', {
      configurable: true,
      value: () => {
        if (stage !== 'token') return;
        stage = '';
        return pause(undefined);
      },
    });
    Response.prototype.json = async function () {
      const value: unknown = await original.call(this);
      if (stage === 'parser' && new URL(this.url).pathname === path) {
        stage = '';
        return pause(value);
      }
      return value;
    };
    Object.defineProperty(window, '__nativeReadProof', {
      configurable: true,
      value: {
        target(value: string) {
          if (!/^\/api\/[a-z0-9/-]+$/u.test(value))
            throw new Error('Invalid native observation target');
          path = value;
        },
        arm(value: string) {
          stage = value;
          held = false;
          release = undefined;
          completion = undefined;
        },
        read() {
          return { held };
        },
        async release() {
          stage = '';
          release?.();
          await completion;
        },
        async restore() {
          stage = '';
          release?.();
          await completion;
          Response.prototype.json = original;
          Reflect.deleteProperty(window, '__prismaLocalDemoTokenGate');
          Reflect.deleteProperty(window, '__nativeReadProof');
        },
      },
    });
  });
  installed.add(page);
}

export async function nativeReadProof(
  page: Page,
  operation: 'arm' | 'target' | 'read' | 'release' | 'restore',
  stage?: string,
) {
  return page.evaluate(
    async ({ operation, stage }) => {
      const controller: unknown = Reflect.get(window, '__nativeReadProof');
      if (!controller || typeof controller !== 'object')
        throw new Error('Missing native read observation');
      const callback: unknown = Reflect.get(controller, operation);
      if (typeof callback !== 'function')
        throw new Error('Missing native read operation');
      const value: unknown = await callback(stage);
      return value;
    },
    { operation, stage },
  );
}
