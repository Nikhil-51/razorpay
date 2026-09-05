"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function MetricsPage() {
  const [stats, setStats] = useState<any>(null)
  const [tierData, setTierData] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchMetrics = async () => {
    const { data: run } = await supabase.from('reconciliation_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      
    if (run) {
      setStats(run)
      
      const { data: matches } = await supabase.from('reconciliation_matches').select('tier').eq('run_id', run.id)
      if (matches) {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0 }
        matches.forEach(m => {
            if(counts[m.tier as keyof typeof counts] !== undefined) {
                counts[m.tier as keyof typeof counts]++
            }
        })
        setTierData([
          { name: 'Tier 1 (Exact)', count: counts[1] },
          { name: 'Tier 2 (Tolerance)', count: counts[2] },
          { name: 'Tier 3 (Aggregate)', count: counts[3] },
          { name: 'Tier 4 (Narrative)', count: counts[4] },
        ])
      }
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">System Metrics</h1>
        <p className="text-zinc-400">Objective reconciliation performance against ground truth.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Precision</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {stats?.precision ? `${(stats.precision * 100).toFixed(1)}%` : '—'}
            </div>
            <p className="text-xs text-zinc-500 mt-1">TP / (TP + FP)</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Recall</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-3xl font-bold text-white">
              {stats?.recall ? `${(stats.recall * 100).toFixed(1)}%` : '—'}
            </div>
            <p className="text-xs text-zinc-500 mt-1">TP / (TP + FN)</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">F1 Score</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-3xl font-bold text-white">
              {stats?.f1 ? `${(stats.f1 * 100).toFixed(1)}%` : '—'}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Harmonic mean</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Exception Yield</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-3xl font-bold text-white">
              {stats?.exception_yield ? `${(stats.exception_yield * 100).toFixed(1)}%` : '—'}
            </div>
            <p className="text-xs text-zinc-500 mt-1">True Negatives / Actual Exceptions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-200">Tier Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tierData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: '#27272a'}} contentStyle={{backgroundColor: '#18181b', borderColor: '#27272a'}} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-200">Confusion Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="p-2"></div>
                <div className="p-2 font-semibold text-zinc-400 bg-zinc-800/50 rounded">Predicted Match</div>
                <div className="p-2 font-semibold text-zinc-400 bg-zinc-800/50 rounded">Predicted No Match</div>
                
                <div className="p-4 flex items-center justify-center font-semibold text-zinc-400 bg-zinc-800/50 rounded">Actual Match</div>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded flex flex-col justify-center">
                    <span className="text-2xl font-bold text-emerald-500">{stats?.matched_records ?? '—'}</span>
                    <span className="text-xs text-emerald-600 mt-1">True Positive (TP)</span>
                </div>
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded flex flex-col justify-center">
                    <span className="text-2xl font-bold text-red-500">—</span>
                    <span className="text-xs text-red-600 mt-1">False Negative (FN)</span>
                </div>

                <div className="p-4 flex items-center justify-center font-semibold text-zinc-400 bg-zinc-800/50 rounded">Actual No Match</div>
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded flex flex-col justify-center">
                    <span className="text-2xl font-bold text-red-500">—</span>
                    <span className="text-xs text-red-600 mt-1">False Positive (FP)</span>
                </div>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded flex flex-col justify-center">
                    <span className="text-2xl font-bold text-emerald-500">{stats?.exception_records ?? '—'}</span>
                    <span className="text-xs text-emerald-600 mt-1">True Negative (TN)</span>
                </div>
            </div>
            <p className="text-xs text-zinc-500 mt-4 text-center">Note: FN and FP require manual review data to calculate precisely.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
