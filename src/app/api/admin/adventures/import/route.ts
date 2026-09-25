import { api, HttpError } from '@/server/auth/current';
import { extractText, importAdventure } from '@/server/adventures';

const MAX_BYTES = 30 * 1024 * 1024;

export const POST = api(
  async ({ req, user }) => {
    const form = await req.formData();
    const file = form.get('file');
    const modelKey = String(form.get('modelKey') ?? '');
    const visibility = form.get('visibility') === 'all' ? 'all' : 'owner';
    const condense = form.get('condense') !== 'false';
    if (!(file instanceof File)) throw new HttpError(400, 'Choose a PDF, Markdown or text file.');
    if (file.size > MAX_BYTES) throw new HttpError(400, 'That file is larger than 30 MB.');
    if (!/\.(pdf|md|markdown|txt)$/i.test(file.name)) throw new HttpError(400, 'Only PDF, Markdown and text files can be imported.');
    try {
      const text = await extractText(file);
      const id = await importAdventure(user, text, modelKey, { visibility, condense });
      return { id };
    } catch (e) {
      throw new HttpError(400, `Import failed: ${(e as Error).message}`);
    }
  },
  { admin: true },
);
