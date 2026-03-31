# Pulse

A personal feed aggregator that monitors RSS feeds, websites, YouTube channels, and subreddits. Built with Next.js 16, Supabase, and Tailwind CSS 4.

## Features

- **RSS/Atom feeds** -- auto-discovered or manually added
- **Website change detection** -- monitors pages for content updates
- **YouTube channels** -- tracks new uploads via RSS
- **Reddit subreddits** -- monitors via public RSS feeds
- **Bookmarks & tags** -- organize saved items
- **AI summarization** -- Claude, OpenAI, or Gemini (bring your own key)
- **Push notifications** -- for high-priority sources (Web Push / VAPID)
- **Automatic polling** -- Vercel Cron runs every 5 minutes

## Prerequisites

- Node.js 20+
- A Supabase project
- A Google OAuth app (for sign-in)

## Environment Variables

Create `.env.local` from the example:

```bash
cp .env.local.example .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `ENCRYPTION_SECRET` | Secret for encrypting user API keys at rest |

Optional variables:

| Variable | Description |
|---|---|
| `CRON_SECRET` | Vercel Cron authorization secret |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key for push notifications |
| `VAPID_PRIVATE_KEY` | VAPID private key for push notifications |
| `VAPID_SUBJECT` | VAPID subject (e.g., `mailto:you@example.com`) |
| `AI_PROVIDER` | Default AI provider: `claude`, `openai`, or `gemini` |
| `AI_API_KEY` | Default AI API key (fallback if user has none set) |
| `AI_MODEL` | Default AI model override |

### Generating VAPID Keys

```bash
npx web-push generate-vapid-keys
```

### Generating ENCRYPTION_SECRET

```bash
openssl rand -base64 32
```

## Supabase Setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) and create a new project.

### 2. Run migrations in order

Open the Supabase SQL Editor and run each migration file in sequence:

1. `supabase/migrations/001_initial_schema.sql` -- users, items, user_feed_items
2. `supabase/migrations/002_sources_monitoring.sql` -- sources, feed_states
3. `supabase/migrations/003_bookmarks_tags.sql` -- bookmarks, tags, bookmark_tags
4. `supabase/migrations/004_notifications.sql` -- notifications, push_subscriptions
5. `supabase/migrations/005_user_settings.sql` -- user_settings (AI keys)

Or run `000_all_migrations.sql` which contains everything in one file.

### 3. Configure Google OAuth

1. In Supabase dashboard: **Authentication > Providers > Google** -- enable it
2. In Google Cloud Console: create an OAuth 2.0 Client ID
3. Set the authorized redirect URI to: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
4. Copy the Client ID and Client Secret into Supabase

### 4. Configure auth redirect URLs

In Supabase **Authentication > URL Configuration**:

- **Site URL**: your deployed URL (e.g., `https://pulse-xxx.vercel.app`)
- **Redirect URLs**: add both your deployed URL and `http://localhost:3000` for local dev

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment (Vercel)

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new)
2. Add all environment variables from the table above
3. Deploy -- Vercel auto-detects Next.js
4. Update the Supabase Site URL and Redirect URLs to match the Vercel domain

The `vercel.json` configures a cron job that polls sources every 5 minutes at `/api/sources/poll`.

## How Polling Works

1. Vercel Cron hits `GET /api/sources/poll` every 5 minutes
2. The handler checks all active sources whose check interval has elapsed
3. For RSS sources: fetches the feed, inserts new items, upserts `user_feed_items` per user
4. For website sources: fetches the page, compares content hash, creates items on change
5. High-priority sources trigger push notifications for new items

## Supported Source Types

| Type | Monitoring | How |
|---|---|---|
| RSS/Atom | Automatic | Feed polling |
| Website | Automatic | Page change detection (content hash) |
| YouTube channel | Automatic | YouTube RSS feed |
| Subreddit | Automatic | Reddit public RSS (`/r/{name}/.rss`) |
| X/Twitter profile | Manual only | Paste individual tweet links |

## Project Structure

```
src/
  app/
    api/
      bookmarks/    -- bookmark CRUD
      debug/        -- diagnostic endpoint
      items/        -- save URLs, get feed
      notifications/-- in-app + push subscription
      search/       -- full-text search
      settings/     -- AI provider config
      sources/      -- source CRUD + poll cron
      summarize/    -- AI summarization
      tags/         -- tag CRUD
    auth/           -- login page + OAuth callback
    dashboard/      -- main app pages
  lib/
    ai/             -- multi-provider AI summarization
    crypto.ts       -- AES encryption for API keys
    extractor/      -- URL detection + content extraction
    monitor/        -- RSS fetcher + page change detector
    notifications/  -- Web Push sender
    supabase/       -- client + admin Supabase helpers
  types/            -- TypeScript interfaces
public/
  sw.js             -- service worker (push notifications)
  icon-192.png      -- app icon (192x192)
  icon-72.png       -- badge icon (72x72)
```
