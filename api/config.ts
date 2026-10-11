import { emailConfigured, json, storageConfigured, vapidPublicKey } from '../server/env.js';

export function GET() {
  return json({ publicKey: vapidPublicKey(), email: emailConfigured(), storage: storageConfigured() });
}
