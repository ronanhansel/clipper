/// <reference types="vite/client" />

interface Window {
  clipper?: {
    platform: string;
    readTextFile: (relativePath: string) => Promise<string>;
    writeTextFile: (relativePath: string, content: string) => Promise<void>;
  };
}
