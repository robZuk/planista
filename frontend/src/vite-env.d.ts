/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** DSN error-trackingu (publiczny — wpiekany do bundla). Pusty = wylaczone. */
  readonly VITE_SENTRY_DSN?: string;
  /** SHA commita (build-arg z CI) — powiazanie bledow z deployem. */
  readonly VITE_GIT_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
