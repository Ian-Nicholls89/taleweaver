# Taleweaver

A self-hosted web app for solo, theatre-of-the-mind Dungeons & Dragons one-shots, with an AI as the Dungeon Master.

- **An AI Dungeon Master.** Pick from Claude, Gemini, OpenAI, Groq, Grok, Mistral, Cerebras, DeepSeek, Perplexity, anything on OpenRouter, or a locally-hosted **Ollama** model — no API key, no cost, nothing leaves your network. The DM narrates, voices NPCs and runs the rules. Dice rolls, checks, attacks, HP, inventory and conditions are handled by server-side tools, so the numbers are real and nothing is made up.
- **One-shots with a title and blurb.** The app ships with six original adventures. The AI can also pitch three new ones on demand and write up the one you choose. As admin, you can import adventures you own (PDF or Markdown) for private use.
- **Pictures and sound.** Each new scene gets an illustration, from OpenAI, Replicate (FLUX), Stability AI or your own GPU (Automatic1111 or ComfyUI), or no images at all. Ambience and sound effects follow the story. They're synthesised in the browser out of the box, or you can drop in your own files. The DM's narration can be read aloud with the browser's voices, OpenAI TTS or ElevenLabs.
- **Private by default.** Everyone logs in. New accounts can only be created from single-use invite links made by an admin.

---

## Quick start (Docker)

You need Docker with Compose on the machine that will host the app.

```bash
git clone <this repo> taleweaver && cd taleweaver
cp .env.example .env
# Edit .env and set at least:
#   APP_SECRET=      (run: openssl rand -base64 48)
#   ADMIN_PASSWORD=  (10+ characters)
#   PUBLIC_URL=      (e.g. https://dnd.example.com)
docker compose up -d --build
```

The app now listens on `127.0.0.1:3000` on the host. The port and bind address come from `PORT` and `BIND_ADDRESS` in `.env`. Next, point a subdomain at that port (see below) and sign in as the admin.

**First steps as admin**

1. **Admin → AI models**: paste an API key for at least one provider, press **Fetch models**, then tick the models players may use. Claude and GPT-class models make the best DMs. Models without tool support (marked in the list) can't roll dice for you, so the player rolls with the on-screen dice instead.
2. **Admin → Images & voice**: choose an image generator (or none) and a narration voice.
3. **Admin → Users & invites**: create an invite link and send it privately to a player. Each link works once and expires.

Forgot the admin password, or started without `ADMIN_PASSWORD`?

```bash
docker compose exec taleweaver node create-admin.cjs <username>
```

This creates an admin, or turns an existing user into an admin with a new password.

## Putting it on a subdomain

Point a DNS record for your subdomain (for example `dnd.example.com`) at the server, then use one of the options below. Every option serves the app over HTTPS. Set `PUBLIC_URL` to the `https://` address and keep `TRUST_PROXY=true`.

**Caddy** (fetches certificates automatically):

```caddy
dnd.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

**nginx**:

```nginx
server {
    server_name dnd.example.com;
    listen 443 ssl;
    # ssl_certificate / ssl_certificate_key … (e.g. from certbot)
    client_max_body_size 30m;            # adventure PDF uploads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;             # the DM's reply streams word by word
        proxy_read_timeout 300s;
    }
}
```

**Cloudflare Tunnel** (no open ports on your router): add a public hostname `dnd.example.com` → service `http://localhost:3000` in the tunnel's configuration.

If the reverse proxy runs on a different machine from the app, set `BIND_ADDRESS=0.0.0.0` in `.env`. Then firewall port 3000 so that only the proxy can reach it.

## Using a local model with Ollama

If you'd rather run the Dungeon Master on your own hardware, free and fully private, there are two ways to run Ollama. Either works with Taleweaver the same way once it's reachable.

### Option A: Ollama as a container (no separate install)

`docker-compose.yml` already has an Ollama service, just switched off by default:

```bash
docker compose --profile ollama up -d
docker compose exec ollama ollama pull llama3.1
```

In **Admin → AI models**, find **Ollama (local)**, set the address to `http://ollama:11434` (the two containers share a network and reach each other by service name), and press **Fetch models**.

If you have an NVIDIA GPU, uncomment the `deploy:` block under the `ollama` service in `docker-compose.yml` first (needs the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) installed on the host) — otherwise it runs on CPU, which is fine for small models and slow for large ones.

### Option B: Ollama installed directly on the host

```bash
OLLAMA_HOST=0.0.0.0 ollama serve      # or set OLLAMA_HOST=0.0.0.0 in its systemd unit and restart it
ollama pull llama3.1
```

Ollama only accepts connections from its own machine by default, which a container can't satisfy — `OLLAMA_HOST=0.0.0.0` opens it up. In **Admin → AI models**, set the address to `http://host.docker.internal:11434`, not `http://localhost:11434` (inside the container, "localhost" means the container itself). `docker-compose.yml` already maps that hostname to the host for you. If Ollama runs on a *different* machine on your network instead, use that machine's LAN IP.

### Which model to pull

Not every model can use tools (roll dice, track HP) — this depends on how the model itself was trained, not on Ollama. `llama3.1`, `qwen2.5`, `mistral-nemo`, `command-r` and `firefunction-v2` all support it; **Gemma 2 and Gemma 3 currently don't**. Taleweaver can't tell from Ollama which models support tools, so every newly fetched Ollama model starts with **Tools** switched off in the model list — turn it on only for ones you know support it (check [ollama.com's tools filter](https://ollama.com/search?c=tools) if unsure).

Running a model without tool support isn't broken, just different: instead of rolling dice itself, the DM tells the player what to roll ("make a DC 13 Dexterity save") and continues from what they report. If you'd like real tool support locally, pull `llama3.1` or `qwen2.5` alongside Gemma and switch between them per game from the game screen's Dungeon Master dropdown.

## Costs, roughly

Costs are pay-as-you-go with each provider.

| Item | Typical cost |
|---|---|
| One DM turn | fractions of a cent (small models) to a few cents (frontier models) |
| A 2–3 hour one-shot | roughly $0.10–$2 depending on the model |
| Scene image | ~$0.003 (FLUX schnell) to ~$0.04–0.07 (gpt-image), 5–15 per adventure |
| Server narration | a few cents per adventure; the browser voice is free |

Adventure notes and rules are sent in a stable prompt prefix, so providers that cache prompts (Anthropic, OpenAI, DeepSeek, Gemini) charge less on each turn after the first. **Admin → Usage & limits** shows token usage per player and model. You can also set a daily token cap per player, and pick a cheaper model for writing story summaries.

## Adventures and licensing

- The rules summary the DM uses paraphrases the **System Reference Document 5.2** by Wizards of the Coast LLC, licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode).
- The six bundled one-shots are original works written for this project. They use SRD creatures and rules only.
- Official adventures and DMsGuild community content generally can't be redistributed, so none are bundled. If you own one, import it under **Admin → Adventures**. Imports stay private on your server unless you choose to share them with your players.
- To add your own adventure by hand, put a Markdown file in `content/adventures/` with the same frontmatter as the bundled ones (`title`, `blurb`, `level`, `length`, `tags`, `warnings`). You can also import it with "convert with AI" unticked.

## Sound

The app plays scene ambience (tavern, storm, cave, combat…) and sound effects from built-in synthesisers, so there's sound from the first run. For richer sound, add CC0 audio files and list them in `public/audio/manifest.json`. With Docker, mount a folder over `/app/public/audio` (there's a commented example in `docker-compose.yml`). See [`public/audio/README.md`](public/audio/README.md) for the tags and where to find free sounds.

## Backups

Everything lives in the `taleweaver-data` Docker volume: the SQLite database, generated images and cached narration. To back it up:

```bash
docker compose stop
docker run --rm -v taleweaver_taleweaver-data:/data -v "$PWD":/backup busybox tar czf /backup/taleweaver-backup.tgz -C /data .
docker compose start
```

Keep your `.env` too. Without the same `APP_SECRET`, the saved API keys can't be decrypted, and you'll have to re-enter them.

## Security notes

- Passwords are hashed with Argon2id. Sessions are random tokens, stored as hashes, in HTTP-only cookies that also get the `Secure` flag when `PUBLIC_URL` is `https`.
- Logins are rate-limited per IP address and per username. Requests that change data must come from the app's own origin.
- Provider API keys are encrypted with AES-256-GCM using a key derived from `APP_SECRET`. They are never sent to browsers, and the admin page shows only the last four characters.
- Registration only works with a valid invite. Invites are single-use, expire, and are stored as hashes.
- Each player can only see their own games and images.

## Development

Requires Node.js 22 or later.

```bash
npm install
TALEWEAVER_ENABLE_MOCK=1 ADMIN_USERNAME=admin ADMIN_PASSWORD=dev-password-123 npm run dev
```

`TALEWEAVER_ENABLE_MOCK=1` adds a scripted "mock DM" model and a placeholder image generator, so you can click through everything without API keys. Data goes to `./data`.

```bash
npm test               # unit tests (dice, rules tools, auth, invites, key vault, content, character builder)
npm run build
npm run test:e2e       # Playwright: invite → register → play → resume, against the production build
npm run typecheck
```

Project layout:

```
src/app/            pages and API routes (Next.js App Router)
src/server/auth/    sessions, passwords, invites, rate limiting
src/server/dm/      the DM engine: prompt, tools (dice, combat, inventory, scenes), turn loop, summaries
src/server/llm/     provider registry, model catalogue, encrypted key vault, mock model
src/server/media/   image generators and narration
src/server/adventures/  bundled, AI-generated and imported adventures
content/            bundled adventures, SRD rules summary, pre-generated heroes
drizzle/            database migrations (run automatically at start-up)
```

After changing `src/server/db/schema.ts`, run `npm run db:generate` to create a migration.
