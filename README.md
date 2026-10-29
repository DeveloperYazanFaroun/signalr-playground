# SignalR Real-Time Lab — Reference Project

Reference solution for the training session **"Building Real-Time Apps with SignalR in .NET & Angular"**.

| Layer  | Stack |
|--------|-------|
| Server | .NET 10, ASP.NET Core SignalR, JWT bearer auth, minimal APIs, `BackgroundService` |
| Client | Angular 22 (standalone, zoneless, signals), RxJS 7, `@microsoft/signalr` 10, Tailwind CSS 4 |

## Run it

```bash
# 1) API  -> http://localhost:5000
cd server/RealTime.Api
dotnet run

# 2) Angular -> http://localhost:4200
cd client
npm install
npm start
```

Open **two browsers** (or a normal + private window), sign in as `alice` and `bob` (use `admin` for the Admin role), and chat.

## What each feature teaches

| Feature in the UI | Concept | Where to look |
|---|---|---|
| Connection badge | Connection lifecycle, automatic reconnect, state as Observable + Signal | `client/src/app/core/signalr/hub-client.ts` |
| Rooms (join / leave) | **Groups**, rejoin after reconnect | `ChatHub.JoinRoom`, `ChatHubService.rejoinAll` |
| Send message + error under the input | `invoke()` with return value, `HubException` → client-readable errors | `ChatHub.SendToRoom`, `hubErrorMessage()` |
| Online users | `OnConnectedAsync` / `OnDisconnectedAsync`, multi-tab presence | `Services/PresenceTracker.cs` |
| Click a user → private chat | `IUserIdProvider`, `Clients.User(s)` | `Auth/SubjectUserIdProvider.cs` |
| "bob is typing..." | `OthersInGroup`, `send()` + `throttleTime`, `groupBy` + `switchMap` | `ChatHub.Typing`, `pages/chat/chat.ts` |
| Admin broadcast (`admin` user) | `[Authorize(Roles = "Admin")]` on a hub method | `ChatHub.Broadcast` |
| Live Ops → Background jobs | **`IHubContext`** from outside a hub (CareConnect *ImportProgressHub* pattern) | `Services/JobWorker.cs` |
| Live Ops → Live metrics | **Server → client streaming** (`IAsyncEnumerable`, cancellation) | `ProgressHub.StreamMetrics` |
| Live Ops → Upload readings | **Client → server streaming** | `ProgressHub.UploadReadings`, `HubClient.upload()` |
| Server logs per call | **Hub filters** | `Hubs/Filters/HubLoggingFilter.cs` |
| Strongly-typed hubs | `Hub<IChatClient>` – no magic strings on the server | `Hubs/IChatClient.cs` |

## Project layout

```
server/RealTime.Api
├── Program.cs                 # CORS, JWT (access_token query), AddSignalR, MapHub
├── Auth/                      # dev token issuer + IUserIdProvider
├── Hubs/                      # ChatHub, ProgressHub, client interfaces, filters
├── Services/                  # PresenceTracker, JobQueue (Channel<T>), JobWorker
├── Endpoints/ApiEndpoints.cs  # /api/auth/token, /api/jobs, /api/rooms, /api/presence
└── RealTime.Api.http          # try the HTTP endpoints from VS / Rider / VS Code

client/src/app
├── core/signalr/hub-client.ts          # reusable RxJS wrapper (on/invoke/send/stream/upload)
├── core/signalr/chat-hub.service.ts    # typed chat API + presence + rejoin
├── core/signalr/progress-hub.service.ts
├── core/auth.service.ts                # token, interceptor, guard
├── pages/chat, pages/live-ops, pages/login
└── shared/connection-badge.ts
```

## Try these experiments

1. Stop the API while both browsers are open → badge turns amber → start it again → rooms are rejoined automatically.
2. Open two tabs as `alice` → close one → alice stays online (presence counts connections, not users).
3. Send a 600-character message → readable validation error from `HubException`.
4. Start a job, open a second tab as the same user → both tabs show progress (`Clients.User`).
5. Set `EnableDetailedErrors = false` and throw a normal exception in a hub method → client gets a generic error.

## Scaling out (advanced)

Uncomment the Redis package in `RealTime.Api.csproj` and `.AddStackExchangeRedis(...)` in `Program.cs`, then run Redis:

```bash
docker run -d -p 6379:6379 redis:7
```

Run two API instances on different ports and point two browsers at different instances – messages still flow.
Remember: `PresenceTracker` is in-memory, so presence must move to Redis too.

> ⚠️ The `/api/auth/token` endpoint and the signing key in `appsettings.json` are for training only.
