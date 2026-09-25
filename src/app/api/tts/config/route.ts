import { api } from '@/server/auth/current';
import { getSetting } from '@/server/settings';

/** Tells the player UI whether to use browser speech or the server voice. */
export const GET = api(async () => ({ provider: getSetting('tts').provider }));
