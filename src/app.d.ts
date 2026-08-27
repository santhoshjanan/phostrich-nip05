declare global {
  namespace App {
    interface Locals {
      user: { pubkey: string } | null;
    }
  }
}

export {};
