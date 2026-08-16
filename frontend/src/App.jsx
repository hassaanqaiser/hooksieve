import React, { useState, useEffect } from 'react';
import { CheckCircle2, Zap, Terminal, RefreshCw } from 'lucide-react';

const API_URL = 'https://hooksieve-production.up.railway.app';

export default function HookSieveDashboard() {
  const [metrics, setMetrics] = useState({
    totalIngested: '0',
    activeConsumers: '1',
    processingLatency: '38ms',
    dlqErrors: '0'
  });
  const [recentStream, setRecentStream] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);

  const fetchMetrics = async () => {
    try {
      const res = await fetch(`${API_URL}/api/metrics?t=${Date.now()}`);
      const data = await res.json();
      if (data.success) {
        setMetrics(data.metrics);
        setRecentStream(data.recentStream);
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, []);

  const simulateLoadSpike = async () => {
    setIsSimulating(true);
    try {
      // Fire a burst of webhooks at /api/ingress so it actually looks like
      // a spike hitting the pipeline, instead of a single lonely request.
      const producers = ['LoadTester-A', 'LoadTester-B', 'LoadTester-C'];
      const requests = Array.from({ length: 8 }, (_, i) =>
        fetch(`${API_URL}/api/ingress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'load_spike.test',
            producer_id: producers[i % producers.length],
          }),
        }).catch(() => {})
      );
      await Promise.all(requests);
    } catch (e) {
      console.log('Spike simulation triggered');
    }
    setTimeout(() => {
      setIsSimulating(false);
      fetchMetrics();
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-100 font-sans p-6 md:p-8">
      <header className="flex items-center justify-between pb-6 border-b border-slate-800 mb-8">
        <div className="flex items-center space-x-3">
          <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
            <Zap className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              HookSieve <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">v1.2 Live</span>
            </h1>
            <p className="text-xs text-slate-400">Distributed Webhook Telemetry & Ingestion Plane</p>
          </div>
        </div>
        <div>
          <button
            onClick={simulateLoadSpike}
            disabled={isSimulating}
            className="flex items-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSimulating ? 'animate-spin' : ''}`} />
            <span>{isSimulating ? 'Simulating Spike...' : 'Simulate Load Spike'}</span>
          </button>
        </div>
      </header>

      <main className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <span className="text-sm font-medium text-slate-400">Total Processed</span>
            <div className="mt-2 text-3xl font-bold text-white">{metrics.totalIngested}</div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <span className="text-sm font-medium text-slate-400">Active Workers</span>
            <div className="mt-2 text-3xl font-bold text-white">{metrics.activeConsumers}</div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <span className="text-sm font-medium text-slate-400">Processing Latency</span>
            <div className="mt-2 text-3xl font-bold text-white">{metrics.processingLatency}</div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
            <span className="text-sm font-medium text-slate-400">Dead-Letter Queue</span>
            <div className="mt-2 text-3xl font-bold text-rose-400">{metrics.dlqErrors}</div>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-400" /> Live Database Stream (Supabase)
          </h2>
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Event ID</th>
                <th className="pb-3 font-medium">Producer ID</th>
                <th className="pb-3 font-medium">Processed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {recentStream.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-6 text-center text-slate-500">
                    No webhooks processed yet. Run your worker script to stream data!
                  </td>
                </tr>
              ) : (
                recentStream.map((item, index) => (
                  <tr key={item.id || item.event_id || index}>
                    <td className="py-3"><CheckCircle2 className="w-4 h-4 text-emerald-400" /></td>
                    <td className="py-3 text-white">{item.id || item.event_id}</td>
                    <td className="py-3 text-indigo-300">{item.producer_id}</td>
                    <td className="py-3 text-slate-500">
                      {item.processed_at ? new Date(item.processed_at).toLocaleString() : 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}