# HookSieve

**A production-grade, distributed webhook telemetry and ingestion plane.**

HookSieve is built to handle high-throughput webhook delivery and event processing reliably — without letting traffic spikes overwhelm your database or take down your app. It decouples ingestion from processing using a queue-and-worker architecture, so incoming webhooks are always accepted, buffered, and processed safely, even under heavy load.

---

## Why HookSieve?

Processing incoming webhooks synchronously is risky: a traffic spike, a slow downstream call, or a database hiccup can cause dropped events, timeouts, or cascading failures. HookSieve solves this by separating **ingestion** (fast, always-on, non-blocking) from **processing** (safe, retryable, backpressure-aware).

```
 External Providers
        │
        ▼
 ┌─────────────────────┐
 │  Fastify Ingress     │  ← receives, validates, and instantly
 │  Plane                │     acknowledges incoming webhooks
 └──────────┬───────────┘
            │
            ▼
 ┌─────────────────────┐
 │  Redis Streams        │  ← buffers events, provides adaptive
 │  (Queue & Backpressure)│     backpressure under load
 └──────────┬───────────┘
            │
            ▼
 ┌─────────────────────┐
 │  Background Workers   │  ← parse, validate, retry (exponential
 │                        │     backoff), and dispatch downstream
 └──────────┬───────────┘
            │
            ▼
 ┌─────────────────────┐
 │  Supabase (Postgres)  │  ← persists events, logs, and delivery
 │                        │     status for querying/auditing
 └──────────┬───────────┘
            │
            ▼
 ┌─────────────────────┐
 │  Realtime Dashboard   │  ← live throughput, latency, and
 │  (React / Vite)        │     success/failure metrics
 └─────────────────────┘
```

---

## Key Features

- **Fastify Ingress Plane** — a lightweight, high-performance public HTTP entry point that receives, validates, and acknowledges webhooks with minimal overhead.
  - `POST /api/ingress` — ingestion endpoint (also used for load simulations)
  - `GET /api/metrics` — real-time telemetry endpoint
- **Redis Streams for Queuing & Backpressure** — durable message buffering so bursts of webhooks are never lost, with adaptive backpressure to protect downstream services.
- **Dedicated Background Workers** — asynchronous consumers that safely parse payloads, run validation/safety checks, and retry failed deliveries with exponential backoff.
- **Supabase (PostgreSQL) Persistence** — durable storage for webhook events, processing logs, and delivery status, enabling historical queries and failed-payload inspection.
- **Real-Time Telemetry Dashboard** — a React/Vite frontend with live throughput, latency, and success/failure metrics, plus a built-in "Simulate Load Spike" tool for stress-testing the system.

---

## Architecture Overview

| Layer | Technology | Responsibility |
|---|---|---|
| Ingress | Fastify | Accept, validate, and acknowledge incoming webhooks |
| Queue | Redis Streams | Buffer events, apply backpressure |
| Processing | Node.js Workers | Parse, validate, retry, and dispatch events |
| Persistence | Supabase (PostgreSQL) | Store events, logs, and delivery status |
| Frontend | React + Vite | Real-time monitoring dashboard |

---

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- Redis (local instance or hosted, e.g. Redis Cloud/Upstash)
- A [Supabase](https://supabase.com) project (URL + service key)
- npm / pnpm / yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/<your-username>/hooksieve.git
cd hooksieve

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Server
PORT=3000

# Redis
REDIS_URL=redis://localhost:6379

# Supabase
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_KEY=your-supabase-service-role-key

# Worker
WORKER_CONCURRENCY=5
RETRY_MAX_ATTEMPTS=5
RETRY_BASE_DELAY_MS=1000
```

> Adjust variable names to match your actual codebase configuration.

### Running Locally

```bash
# Start the Fastify ingress server
npm run start:server

# Start the background workers (in a separate process)
npm run start:worker

# Start the frontend dashboard
npm run dev:client
```

By default:
- Ingress API: `http://localhost:3000`
- Dashboard: `http://localhost:5173`

---

## Usage

### Sending a Test Webhook

```bash
curl -X POST http://localhost:3000/api/ingress \
  -H "Content-Type: application/json" \
  -d '{"event": "payment.success", "data": {"amount": 4999, "currency": "USD"}}'
```

### Checking Metrics

```bash
curl http://localhost:3000/api/metrics
```

### Simulating a Load Spike

Use the **"Simulate Load Spike"** button in the dashboard to fire a burst of synthetic webhook events and watch the ingestion, queue depth, and worker throughput respond in real time.

---

## Project Structure

```
hooksieve/
├── server/          # Fastify ingress plane
├── workers/         # Background worker processes
├── client/          # React/Vite telemetry dashboard
├── shared/          # Shared types/utilities
├── supabase/        # DB schema & migrations
└── README.md
```

> Update this to reflect your actual repository layout.

---

## Roadmap

- [ ] Signature verification per-provider (Stripe, GitHub, Shopify, etc.)
- [ ] Dead-letter queue for permanently failed events
- [ ] Multi-tenant API key support
- [ ] Configurable retry/backoff policies per endpoint
- [ ] Horizontal worker autoscaling

---

## Contributing

Contributions, issues, and feature requests are welcome. Feel free to open an issue or submit a pull request.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Acknowledgements

Built with [Fastify](https://fastify.dev/), [Redis Streams](https://redis.io/docs/data-types/streams/), [Supabase](https://supabase.com/), and [React](https://react.dev/) + [Vite](https://vitejs.dev/).
