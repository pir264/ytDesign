// Minimal `browser` API for running the content script as a plain page.
const store = {
  async get(key: string) {
    return { [key]: JSON.parse(localStorage.getItem('dev:' + key) || 'null') ?? undefined };
  },
  async set(obj: Record<string, unknown>) {
    for (const [k, v] of Object.entries(obj)) localStorage.setItem('dev:' + k, JSON.stringify(v));
  },
};

(globalThis as any).browser = {
  runtime: {
    getURL: (p: string) => p,
    async sendMessage(msg: { type: string; query: string }) {
      if (msg.type !== 'suggest') return undefined;
      return ['', ' music', ' live', ' mix', ' 1 hour'].map((s) => msg.query.trim() + s);
    },
  },
  storage: { local: store },
};
