# Real-Time-Collaborative-App

A lightweight real-time chat app. Create a room, invite people with a link or
six-character code, and chat while seeing who is online.

## Run locally

1. Install Node.js 22 or newer.
2. From the project folder, install dependencies:

   ```sh
   npm run install:all
   ```

3. Start the server and web app:

   ```sh
   npm run dev
   ```

4. Open <http://localhost:3000>. The server runs on port 3001.

## Features

- Create a room or join with a code; shared invite links prefill the code.
- Real-time chat, message history, online presence, and typing indicators.
- Reconnects to the current room and reports connection/message errors.
- SQLite persistence and a `/health` endpoint.

## Deployment

The Render blueprint builds the client and serves it from the Node server. It
configures a persistent disk at `/data` for the SQLite database; persistent
disks may incur hosting charges. Node.js 22 or newer is required for the
built-in SQLite module.