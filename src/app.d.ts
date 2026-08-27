declare global {
  namespace App {
    interface Locals {
      user: { pubkey: string } | null;
    }
  }

  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: unknown): Promise<import('nostr-tools').Event>;
    };
  }
}

export {};
