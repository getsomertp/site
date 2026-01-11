# GETSOME - Affiliate Casino Website

## Overview
A casino affiliate website for streamers featuring leaderboards, giveaways, and affiliate partnerships. Users can connect via Discord, link their casino accounts, and participate in giveaways.

## Tech Stack
- **Frontend**: React, Vite, TailwindCSS, Framer Motion, shadcn/ui
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: wouter (frontend), Express (backend)

## Project Structure
```
client/src/
  pages/         - React page components
  components/    - Reusable UI components
  hooks/         - Custom React hooks
  lib/           - Utility functions
server/
  routes.ts      - API endpoints
  storage.ts     - Database operations
  db.ts          - Database connection
shared/
  schema.ts      - Drizzle schema definitions
```

## Key Features
- **Affiliates Page**: Displays casino partners with affiliate codes and links
- **Giveaways Page**: Lists active and past giveaways
- **Leaderboard Page**: Shows separate leaderboards for each casino with casino selector (API integration ready)
- **Profile Page**: User profile management
- **Admin Dashboard**: Manage casinos, affiliates, giveaways, and stream events
- **Stream Events**: Interactive stream games (Tournament, Bonus Hunt, Guess the Balance)

## API Endpoints

### Public
- `GET /api/casinos` - List active casinos
- `GET /api/giveaways` - List all giveaways
- `GET /api/giveaways/active` - List active giveaways

### Admin (requires authentication)
- `GET /api/admin/casinos` - List all casinos including inactive
- `POST /api/admin/casinos` - Create casino
- `PATCH /api/admin/casinos/:id` - Update casino
- `DELETE /api/admin/casinos/:id` - Delete casino
- `POST /api/admin/giveaways` - Create giveaway
- `PATCH /api/admin/giveaways/:id` - Update giveaway
- `DELETE /api/admin/giveaways/:id` - Delete giveaway
- `GET /api/admin/users` - List all users (supports ?search= query)
- `GET /api/admin/users/:id` - Get user full details (accounts, wallets, payments)
- `POST /api/admin/users/:id/payments` - Add payment record for user
- `GET /api/admin/users/:id/payments` - Get user payment history

### Stream Events (admin only)
- `GET /api/admin/stream-events` - List all stream events (optional ?type= filter)
- `GET /api/admin/stream-events/:id` - Get event with entries and brackets
- `POST /api/admin/stream-events` - Create new event
- `PATCH /api/admin/stream-events/:id` - Update event
- `DELETE /api/admin/stream-events/:id` - Delete event
- `POST /api/admin/stream-events/:id/entries` - Add entry to event
- `DELETE /api/admin/stream-events/:eventId/entries/:entryId` - Remove entry
- `POST /api/admin/stream-events/:id/lock` - Lock entries and randomize
- `POST /api/admin/stream-events/:id/start` - Start the event
- `POST /api/admin/stream-events/:id/complete` - Mark event complete
- `PATCH /api/admin/stream-events/:eventId/brackets/:bracketId` - Update bracket winner
- `POST /api/admin/stream-events/:id/bonus/bonused` - Mark current slot as bonused
- `POST /api/admin/stream-events/:id/bonus/no-bonus` - Mark current slot as no bonus
- `PATCH /api/admin/stream-events/:eventId/entries/:entryId/payout` - Update bonus payout

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secret for session encryption (required)
- `ADMIN_SECRET` - Admin password for login (required)

## Security Notes

### Admin Authentication
Admin authentication uses session-based auth with the following flow:
1. Admin navigates to /admin and sees login form
2. Admin enters ADMIN_SECRET password
3. Server validates and creates authenticated session (with session regeneration to prevent fixation)
4. Admin link only appears in navigation for authenticated admins
5. All admin API endpoints check session.isAdmin before allowing access

### Authentication Endpoints
- `POST /api/admin/login` - Login with password, returns session cookie
- `POST /api/admin/logout` - Destroy session
- `GET /api/admin/me` - Check current admin status

### Production Checklist
- [x] Session-based authentication with secure cookies
- [x] Remove admin link from public navigation for non-admin users
- [x] Session regeneration on login to prevent fixation attacks
- [ ] Set strong `ADMIN_SECRET` environment variable
- [ ] Implement Discord OAuth for user authentication (optional)
- [ ] Add rate limiting to API endpoints
- [ ] Enable HTTPS only

## Database Schema
- `casinos` - Casino partners with affiliate info and leaderboard API config (tier can be: platinum, gold, silver, or none)
- `users` - Discord-linked user accounts
- `user_casino_accounts` - User's casino account links
- `user_wallets` - User's SOL wallet addresses
- `user_payments` - Tracks money given to users (amount, type, notes)
- `giveaways` - Giveaway definitions (can be linked to a specific casino via casinoId)
- `giveaway_requirements` - Multiple requirements per giveaway (type: discord, wager, vip, linked_account)
- `giveaway_entries` - User entries in giveaways
- `leaderboard_cache` - Cached leaderboard data
- `stream_events` - Stream event definitions (type: tournament, bonus_hunt, guess_balance)
- `stream_event_entries` - Player entries for stream events with slot choices
- `tournament_brackets` - Tournament bracket structure with round/match tracking

## Giveaway Requirements System
Giveaways can have multiple requirements:
- **discord** - User must be a Discord member
- **wager** - User must wager a certain amount (can be tied to specific casino)
- **vip** - User must have VIP status
- **linked_account** - User must have a linked casino account (can be tied to specific casino)

Requirements are managed in the Admin dashboard with an intuitive multi-requirement editor.

## Development
Run `npm run dev` to start the development server on port 5000.
Run `npm run db:push` to sync database schema.
