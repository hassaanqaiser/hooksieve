import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STREAM_KEY = 'stream:webhooks';
const MAX_RETRIES = 3;
const RATE_LIMIT_MAX = 5;
const POLL_INTERVAL_MS = 1500;

// Fixed Window Rate Limiter via Atomic Redis Operations
async function checkRateLimit(producerId) {
  const windowKey = `ratelimit:${producerId}:${Math.floor(Date.now() / 10000)}`;
  const currentRequests = await redis.incr(windowKey);
  if (currentRequests === 1) {
    await redis.expire(windowKey, 10);
  }
  return currentRequests <= RATE_LIMIT_MAX;
}

// Simulated Downstream Webhook Delivery with Failure Injection
async function deliverWebhook(payload, attempt) {
  const simulateFailure = Math.random() < 0.2;
  if (simulateFailure) {
    throw new Error('HTTP 503: Target Server Unavailable (Simulated)');
  }
  return true;
}

// Exponential Backoff with Jitter
function getBackoffDelay(attempt) {
  const baseDelay = Math.pow(2, attempt) * 1000;
  const jitter = Math.random() * 500;
  return baseDelay + jitter;
}

async function processEntry(id, fields) {
  const webhookId = fields.webhook_id;
  const producerId = fields.producer_id;

  let payload = {};
  try {
    if (fields.data && fields.data !== 'undefined') {
      payload = typeof fields.data === 'string' ? JSON.parse(fields.data) : fields.data;
    }
  } catch (e) {
    payload = { raw: fields.data };
  }

  const isAllowed = await checkRateLimit(producerId);
  if (!isAllowed) {
    console.warn(`[RATE LIMITED] Producer ${producerId} exceeded limit. Throttling...`);
    await new Promise((res) => setTimeout(res, 2000));
  }

  let success = false;
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[DELIVERY ATTEMPT ${attempt}] Webhook: ${webhookId}`);
      await deliverWebhook(payload, attempt);
      success = true;
      break;
    } catch (err) {
      lastError = err.message;
      if (attempt < MAX_RETRIES) {
        const delay = getBackoffDelay(attempt);
        console.log(`Attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  if (!success) {
    console.error(`[DLQ ROUTE] Webhook ${webhookId} failed after ${MAX_RETRIES} attempts.`);
    try {
      await redis.incr('dlq:count');
    } catch (e) {}

    await supabase.from('dlq_events').insert([
      {
        webhook_id: webhookId,
        producer_id: producerId,
        payload,
        error_reason: lastError,
        failed_attempts: MAX_RETRIES,
      },
    ]);

    await supabase.from('webhooks').update({ status: 'failed_dlq' }).eq('id', webhookId);
  } else {
    await supabase.from('webhooks').update({ status: 'delivered' }).eq('id', webhookId);

    await supabase.from('processed_webhooks').insert([
      {
        id: webhookId,
        producer_id: producerId,
        status: 'delivered',
        processed_at: new Date().toISOString(),
      },
    ]);
  }

  // Remove from the stream now that it's been handled either way
  await redis.xdel(STREAM_KEY, id);
}

async function processStream() {
  console.log('HookSieve Processing Worker active...');

  while (true) {
    try {
      // NOTE: the original code used redis.xread(STREAM_KEY, 0, 1, { block: 2000 }).
      // That call signature doesn't match the @upstash/redis SDK, and blocking
      // reads don't work meaningfully over Upstash's HTTP REST transport anyway
      // (there's no persistent connection for the server to hold open). xrange
      // is the reliable way to poll a stream over REST: grab the oldest entry,
      // process it, delete it, repeat.
      const entries = await redis.xrange(STREAM_KEY, '-', '+', 1);
      const ids = Object.keys(entries || {});

      if (ids.length === 0) {
        await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
        continue;
      }

      for (const id of ids) {
        await processEntry(id, entries[id]);
      }
    } catch (err) {
      console.error('Worker loop error:', err);
      await new Promise((res) => setTimeout(res, 1000));
    }
  }
}

processStream();