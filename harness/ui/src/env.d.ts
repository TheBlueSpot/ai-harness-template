/// <reference types="bun-types" />

declare module "solid-js/web/dist/web.js" {
  export * from "solid-js/web";
}

interface ImportMeta {
  hot?: {
    accept: (cb?: ((module: unknown) => void) | string | string[]) => void;
    dispose: (cb: () => void) => void;
    data: unknown;
  };
}
