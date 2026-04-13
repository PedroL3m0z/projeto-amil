/**
 * Mock mínimo para o Jest e2e (evita carregar o pacote ESM `baileys`).
 * Mantenha alinhado com imports em `src/core/bot/bot-auth.store.ts` e `bot.service.ts`.
 */
export const BufferJSON = {
  replacer: (_k: string, v: unknown) => v,
  reviver: (_k: string, v: unknown) => v,
};

export const proto = {
  Message: {
    AppStateSyncKeyData: {
      fromObject: (v: object) => v,
    },
  },
} as const;

export function initAuthCreds() {
  return {} as Record<string, unknown>;
}

export function useMultiFileAuthState() {
  return Promise.resolve({
    state: {} as never,
    saveCreds: async () => {},
  });
}

export const Browsers = {
  appropriate: (name: string): [string, string, string] => ['x', 'y', name],
};

export const DisconnectReason = {
  loggedOut: 401,
};

export function fetchLatestBaileysVersion() {
  return Promise.resolve({
    version: [2, 3000, 0] as [number, number, number],
  });
}

export type WAMessage = Record<string, unknown>;

export default function makeWASocket() {
  return {
    ev: { on: () => undefined },
    end: () => undefined,
  };
}
