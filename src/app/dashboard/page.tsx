"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2, RefreshCcw, Bell, Settings, User } from "lucide-react"
import { syncRazorpayToDatabase, fetchLiveRazorpayPayments } from "@/app/actions/razorpay"
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart
} from "recharts"

export default function DashboardPage() {
  const [loadingRecon, setLoadingRecon] = useState(false)
  const [loadingSync, setLoadingSync] = useState(false)
  const [loadingAI, setLoadingAI] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [livePayments, setLivePayments] = useState<any[]>([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [historicalRuns, setHistoricalRuns] = useState<any[]>([])
  
  const supabase = createClient()

  useEffect(() => {
    fetchLatestRun()
    loadLivePayments()
  }, [])

  const loadLivePayments = async () => {
    setLoadingPayments(true)
    try {
      const res = await fetchLiveRazorpayPayments()
      if (res.success && res.data) {
        setLivePayments(res.data.slice(0, 5))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingPayments(false)
    }
  }

  const fetchLatestRun = async () => {
    const { data } = await supabase.from('reconciliation_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(7)
    if (data && data.length > 0) {
      setStats(data[0]) // Most recent
      setHistoricalRuns(data.reverse()) // Reverse for chronological order in chart
    }
  }

  const handleLoadDemo = async () => {
    setLoadingRecon(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-demo', {
        body: { seed: Date.now(), user_id: 'user_123' },
      })
      if (error) throw error
      alert(`Synthetic Benchmark Loaded: ${data.records} records across 10 distinct complex scenarios.`)
      await fetchLatestRun()
    } catch (e: any) {
      alert(`Error loading benchmark: ${e.message}`)
    } finally {
      setLoadingRecon(false)
    }
  }

  const handleRunReconciliation = async () => {
    if (!stats || !stats.id) return alert('No dataset loaded.')
    setLoadingRecon(true)
    try {
      const { error } = await supabase.functions.invoke('run-reconciliation', { body: { run_id: stats.id } })
      if (error) throw error
      alert('Reconciliation complete.')
      await fetchLatestRun()
    } catch (e: any) {
      alert(`Error running reconciliation: ${e.message}`)
    } finally {
      setLoadingRecon(false)
    }
  }

  const handleRunAIReconciliation = async () => {
    if (!stats || !stats.id) return alert('No dataset loaded.')
    setLoadingAI(true)
    try {
      const res = await fetch('http://localhost:8000/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: stats.id })
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to run Python AI Agent')
      }
      
      alert('Python AI Agent completed reconciliation.')
      await fetchLatestRun()
    } catch (e: any) {
      alert(`Error running AI reconciliation: ${e.message}`)
    } finally {
      setLoadingAI(false)
    }
  }

  const handleSyncRazorpay = async () => {
    setLoadingSync(true)
    try {
      const runId = stats?.id || "default"
      const res = await syncRazorpayToDatabase(runId)
      if (res.success) {
        alert(`Successfully synced ${res.count} transactions!`)
        await fetchLatestRun()
      } else {
        alert(`Sync failed: ${res.error}`)
      }
    } catch (e: any) {
      alert(`Error syncing: ${e.message}`)
    } finally {
      setLoadingSync(false)
    }
  }

  // Derived metrics for UI
  const matchRate = stats?.match_rate ? stats.match_rate : 0
  const unmatchRate = 100 - matchRate
  const pieData = [
    { name: "Matched", value: matchRate, color: "#ff3b7c" },
    { name: "Unmatched", value: unmatchRate, color: "#3b82f6" }
  ]

  // Real historical data for the line chart
  const lineData = historicalRuns.map(run => {
    const date = new Date(run.created_at)
    return {
      name: date.toLocaleDateString('en-US', { weekday: 'short' }),
      matches: run.matched_records || 0,
      exceptions: run.exception_records || 0,
    }
  })

  return (
    <div className="min-h-screen bg-[#1a1c2d] text-slate-100 p-8 pb-20">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center border-2 border-indigo-400 shadow-lg shadow-indigo-500/20">
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back, User!</h1>
            <p className="text-[#8c92b8] text-sm font-medium">Reconciliation Level <span className="text-[#a5b4fc]">Expert</span> • 1,500 XP</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex gap-4 mr-6">
            <button onClick={handleLoadDemo} disabled={loadingRecon || loadingSync || loadingAI} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-full text-sm font-bold transition-all duration-300 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 active:scale-95 disabled:opacity-50 disabled:pointer-events-none group">
              {loadingRecon ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
              Run Synthetic Benchmark (50+ Records)
            </button>
            <button onClick={handleSyncRazorpay} disabled={loadingSync || loadingRecon} className="flex items-center gap-2 px-5 py-2.5 bg-[#252840] hover:bg-[#2b2e4a] text-[#00e5ff] rounded-full text-sm font-semibold transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,229,255,0.3)] active:scale-95 border border-[#3b3e66] hover:border-[#00e5ff]/50 disabled:opacity-50 disabled:pointer-events-none">
              {loadingSync ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />}
              Sync Razorpay
            </button>
            <button onClick={handleRunAIReconciliation} disabled={loadingRecon || loadingSync || loadingAI || !stats} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white rounded-full text-sm font-bold transition-all duration-300 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 active:scale-95 disabled:opacity-50 disabled:pointer-events-none group">
              {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
              Run AI Agent
            </button>
            <button onClick={handleRunReconciliation} disabled={loadingRecon || loadingSync || loadingAI || !stats} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full text-sm font-bold transition-all duration-300 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 active:scale-95 disabled:opacity-50 disabled:pointer-events-none">
              {loadingRecon ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Reconcile
            </button>
          </div>
          <Bell className="w-6 h-6 text-[#8c92b8] hover:text-white cursor-pointer transition-all duration-300 hover:scale-110 hover:rotate-12" />
          <Settings className="w-6 h-6 text-[#8c92b8] hover:text-white cursor-pointer transition-all duration-300 hover:scale-110 hover:rotate-90" />
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Match Rate Donut */}
        <div className="bg-[#252840] rounded-2xl p-6 shadow-xl border border-[#3b3e66] flex flex-col items-center relative hover:border-[#525686] hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-default group">
          <h2 className="text-[#a3a9cf] font-medium self-start absolute top-6 left-6 group-hover:text-white transition-colors">Match Rate for {new Date().toLocaleString('default', { month: 'long' })}</h2>
          <div className="w-full h-64 mt-8 flex justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  stroke="none"
                  dataKey="value"
                  cornerRadius={10}
                  paddingAngle={5}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1c2d', borderColor: '#3b3e66', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center mt-12 pointer-events-none">
            <span className="text-[#8c92b8] text-xs font-semibold uppercase tracking-wider mb-1">Matched</span>
            <span className="text-4xl font-extrabold text-white">{matchRate.toFixed(1)}%</span>
            <span className="text-xs text-[#8c92b8] mt-1">of {stats?.total_records || 0} records</span>
          </div>

          {/* Legend */}
          <div className="w-full mt-4 space-y-3 px-4">
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff3b7c]" />
                <span className="text-[#8c92b8]">Matched</span>
              </div>
              <span className="font-bold text-white">{stats?.matched_records || 0}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                <span className="text-[#8c92b8]">Exceptions</span>
              </div>
              <span className="font-bold text-white">{stats?.exception_records || 0}</span>
            </div>
          </div>
        </div>

        {/* Processing Progress */}
        <div className="bg-[#252840] rounded-2xl p-6 shadow-xl border border-[#3b3e66] flex flex-col justify-center relative overflow-hidden hover:border-[#525686] hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-default group">
          <h2 className="text-[#a3a9cf] font-medium absolute top-6 left-6 text-center w-full right-6 group-hover:text-white transition-colors">Record Processing</h2>
          
          <div className="mt-8">
            <div className="flex justify-between mb-2">
              <span className="text-xs font-bold text-[#8c92b8] tracking-widest uppercase">PROCESSED</span>
              <span className="text-xs font-bold text-[#00e5ff]">{stats?.total_records || 0} of {stats?.total_records || 0}</span>
            </div>
            <div className="w-full h-3 bg-[#1a1c2d] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#00e5ff] to-[#3b82f6] rounded-full w-full" />
            </div>

            <div className="flex justify-between mt-8 mb-2">
              <span className="text-xs font-bold text-[#8c92b8] tracking-widest uppercase">EXCEPTIONS</span>
              <span className="text-xs font-bold text-[#ff3b7c]">{stats?.exception_records || 0}</span>
            </div>
            <div className="w-full h-3 bg-[#1a1c2d] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#ff3b7c] to-purple-500 rounded-full" style={{ width: `${Math.max(5, unmatchRate)}%` }} />
            </div>
          </div>

          <div className="mt-12 text-center">
            <h3 className="text-4xl font-extrabold text-white">{stats?.total_records || 0}</h3>
            <p className="text-xs font-semibold tracking-wider text-[#8c92b8] uppercase mt-2">Total Records Reconciled</p>
          </div>
        </div>

        {/* Trends Area Chart */}
        <div className="bg-[#252840] rounded-2xl p-6 shadow-xl border border-[#3b3e66] hover:border-[#525686] hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-default group">
          <h2 className="text-[#a3a9cf] font-medium mb-6 group-hover:text-white transition-colors">Reconciliation Trends</h2>
          <div className="w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lineData}>
                <defs>
                  <linearGradient id="colorMatches" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#8c92b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1c2d', borderColor: '#3b3e66', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="matches" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorMatches)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex justify-between items-end mt-4">
            <div>
              <h3 className="text-3xl font-bold text-white">{stats?.total_records ? (stats.total_records * 5) : 1423}</h3>
              <p className="text-sm font-medium text-[#10b981] mt-1">+12% since last week</p>
            </div>
            <div className="flex flex-col gap-2">
              <span className="px-3 py-1 rounded-md bg-blue-500/20 text-blue-400 text-xs font-bold w-fit">98.5% PR</span>
              <span className="px-3 py-1 rounded-md bg-pink-500/20 text-pink-400 text-xs font-bold w-fit">{stats?.exception_records || 42} EXC</span>
            </div>
          </div>
        </div>

        {/* Small metric cards */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Precision', val: stats?.precision ? `${(stats.precision * 100).toFixed(1)}%` : '—', color: 'from-emerald-400 to-emerald-600', sub: 'Accuracy' },
            { label: 'Recall', val: stats?.recall ? `${(stats.recall * 100).toFixed(1)}%` : '—', color: 'from-blue-400 to-indigo-600', sub: 'Completeness' },
            { label: 'F1 Score', val: stats?.f1 ? `${(stats.f1 * 100).toFixed(1)}%` : '—', color: 'from-purple-400 to-fuchsia-600', sub: 'Overall Health' },
            { label: 'Yield', val: stats?.exception_yield ? `${stats.exception_yield.toFixed(2)}` : '—', color: 'from-orange-400 to-red-500', sub: 'Exceptions / Run' },
          ].map((m, i) => (
             <div key={i} className="bg-[#252840] rounded-2xl p-5 shadow-xl border border-[#3b3e66] flex flex-col justify-between group hover:border-[#525686] hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                <p className="text-xs font-bold text-[#8c92b8] tracking-widest uppercase group-hover:text-white transition-colors">{m.label}</p>
                <div className="mt-4 flex items-center justify-between">
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-tr ${m.color} p-[2px]`}>
                    <div className="w-full h-full bg-[#252840] rounded-full flex items-center justify-center">
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${m.color} opacity-20`} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-white group-hover:text-[#00e5ff] transition-colors">{m.val}</p>
                    <p className="text-[10px] text-[#8c92b8] mt-1">{m.sub}</p>
                  </div>
                </div>
             </div>
          ))}
        </div>

        {/* Live Razorpay Payments list */}
        <div className="bg-[#252840] rounded-2xl p-6 shadow-xl border border-[#3b3e66] flex flex-col hover:border-[#525686] hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-default group">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[#a3a9cf] font-medium group-hover:text-white transition-colors">Live Razorpay Payments</h2>
            {loadingPayments && <Loader2 className="w-4 h-4 text-[#00e5ff] animate-spin" />}
          </div>
          <div className="space-y-4 overflow-y-auto flex-1">
            {livePayments.length === 0 && !loadingPayments && (
              <div className="text-sm text-[#8c92b8] text-center py-4">No recent payments</div>
            )}
            {livePayments.map((payment, i) => {
              const dateStr = new Date(payment.created_at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
              const amount = (payment.amount / 100).toLocaleString('en-IN', { style: 'currency', currency: payment.currency || 'INR' })
              return (
                <div key={payment.id || i} className="flex justify-between items-center p-3 rounded-xl border border-transparent hover:bg-[#2b2e4a] hover:border-[#3b3e66] cursor-pointer transition-all duration-200 group/item">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-white bg-[#10b981] px-2 py-1 rounded-full">{dateStr}</span>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-[#8c92b8]">{payment.id.slice(0, 12)}...</span>
                      <span className="text-[10px] font-bold text-[#a3a9cf] uppercase">{payment.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-white">{amount}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
