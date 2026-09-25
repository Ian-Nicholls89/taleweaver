import { desc } from 'drizzle-orm';
import { api } from '@/server/auth/current';
import { getDb, schema } from '@/server/db';

export const GET = api(
  async () => ({
    users: getDb()
      .select({ id: schema.users.id, username: schema.users.username, role: schema.users.role, disabled: schema.users.disabled, createdAt: schema.users.createdAt })
      .from(schema.users)
      .orderBy(desc(schema.users.createdAt))
      .all(),
  }),
  { admin: true },
);
