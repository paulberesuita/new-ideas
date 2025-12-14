# New Ideas - Product Hunt Inspiration

A simple app that fetches Product Hunt's top 3 launches, uses Claude Opus to generate simplified build ideas, stores them in a database, and displays them on a web app.

## Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set environment variables:**
   Create a `.dev.vars` file in the project root (this is the correct file for Cloudflare/Wrangler, not `.env`):
   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   PRODUCT_HUNT_API_TOKEN=your_product_hunt_token_here
   ```
   
   **Note:** Product Hunt API requires authentication. Get your token at https://api.producthunt.com/v2/oauth/applications

3. **Run locally:**
   ```bash
   pnpm dev
   ```
   
4. **Create Pages Project (first time only):**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages
   - Click "Create a project"
   - Choose "Upload assets" (not Git)
   - Name it `new-ideas` (or update `wrangler.toml` with your chosen name)
   - You don't need to upload anything yet, just create the project

5. **Deploy:**
   ```bash
   pnpm run deploy
   ```

6. **Set Environment Variables in Cloudflare:**
   - Go to your Pages project → Settings → Environment Variables
   - Add `ANTHROPIC_API_KEY` with your API key
   - Add `PRODUCT_HUNT_API_TOKEN` with your Product Hunt token (get it at https://api.producthunt.com/v2/oauth/applications)
   - Make sure to set both for "Production" environment

## Project Structure

- `public/` - Frontend HTML/CSS/JS files
- `functions/` - Cloudflare Pages Functions (API endpoints)
- `wrangler.toml` - Cloudflare configuration

## API Endpoints

- `POST /api/fetch-ideas` - Fetches top 3 Product Hunt launches, generates ideas with Claude, and saves to database
- `GET /api/ideas?page=1&limit=10` - Retrieves ideas grouped by date with pagination

## Notes

- Product Hunt GraphQL API requires authentication. Get your API token at https://api.producthunt.com/v2/oauth/applications
- Make sure to set your Anthropic API key in environment variables
- The app uses infinite scroll to load ideas progressively