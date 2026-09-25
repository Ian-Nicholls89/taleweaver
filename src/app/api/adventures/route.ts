import { api } from '@/server/auth/current';
import { listAdventures, listPitches } from '@/server/adventures';

export const GET = api(async ({ user }) => ({ adventures: listAdventures(user), pitches: listPitches(user) }));
