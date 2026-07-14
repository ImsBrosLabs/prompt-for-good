/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PFG_HUB_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
