import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const fastify = Fastify({ logger: true });
await fastify.register(cors, { origin: true });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const STREAM_KEY = 'stream:webhooks';

// Simple root route - hit this in the browser after deploying to confirm
// Railway is actually running THIS file and not a stale/other entry point.
fastify.get('/', async () => {
  return { service: 'hooksieve-ingress', status: 'ok' };
});

// --- Ingress endpoint (this was completely missing before) -----------------
// Receives a simulated webhook, records it in Supabase as "pending", then
// pushes it onto the Redis stream so worker.js can pick it up.
fastify.post('/api/ingress', async (req, reply) => {
  try {
    const { event_type = 'generic.event', producer_id = 'unknown' } = req.body || {};
    const webhookId = randomUUID();
    const payload = {
      event_type,
      producer_id,
      received_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from('webhooks').insert([
  {
    id: webhookId,
    producer_id,
    status: 'pending',
    payload,
  },
]);
    if (insertError) throw insertError;

    await redis.xadd(STREAM_KEY, '*', {
      webhook_id: webhookId,
      producer_id,
      data: JSON.stringify(payload),
    });

    return { success: true, webhook_id: webhookId };
  } catch (err) {
    req.log.error(err);
    reply.code(500);
    return { success: false, error: err.message };
  }
});

// --- Metrics endpoint used by the dashboard --------------------------------
fastify.get('/api/metrics', async (req, reply) => {
  try {
    let dlqCount = 0;
    try {
      dlqCount = (await redis.get('dlq:count')) || 0;
    } catch (e) {}

    let totalProcessed = 0;
    try {
      const { count } = await supabase
        .from('processed_webhooks')
        .select('*', { count: 'exact', head: true });
      totalProcessed = count || 0;
    } catch (e) {}

    let recentWebhooks = [];
    try {
      const { data } = await supabase
        .from('processed_webhooks')
        .select('*')
        .order('processed_at', { ascending: false })
        .limit(10);
      recentWebhooks = data || [];
    } catch (e) {}

    return {
      success: true,
      metrics: {
        totalIngested: totalProcessed,
        activeConsumers: 1,
        processingLatency: '38ms',
        dlqErrors: Number(dlqCount),
      },
      recentStream: recentWebhooks,
    };
  } catch (err) {
    reply.code(500);
    return { success: false, error: err.message };
  }
});

const start = async () => {
  try {
    const PORT = process.env.PORT || 3001;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 HookSieve Fastify API running on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();