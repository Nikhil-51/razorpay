"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default function ExceptionsPage() {
  const [exceptions, setExceptions] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    fetchExceptions()
  }, [])

  const fetchExceptions = async () => {
    const { data } = await supabase.from('exceptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (data) setExceptions(data)
  }

  const handleResolve = async (id: string) => {
    const resolution = prompt("Enter resolution notes:")
    if (resolution === null) return

    const { data: sessionData } = await supabase.auth.getSession()
    const user_id = sessionData?.session?.user?.id || null

    const { error } = await supabase.from('exceptions')
      .update({ 
        status: 'RESOLVED',
        resolution,
        resolved_at: new Date().toISOString(),
        resolved_by: user_id
      })
      .eq('id', id)
      
    if (!error) {
      fetchExceptions()
    } else {
      alert(`Error resolving exception: ${error.message}`)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Exception Queue</h1>
        <p className="text-zinc-400">{exceptions.filter(e => e.status === 'OPEN').length} items require review</p>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
              <TableHead className="text-zinc-400">Exception</TableHead>
              <TableHead className="text-zinc-400">Type</TableHead>
              <TableHead className="text-zinc-400">Source</TableHead>
              <TableHead className="text-zinc-400">Record</TableHead>
              <TableHead className="text-zinc-400">Amount</TableHead>
              <TableHead className="text-zinc-400">Age</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-zinc-400 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exceptions.map((exc) => (
              <TableRow key={exc.id} className="border-zinc-800 hover:bg-zinc-800/50">
                <TableCell className="font-mono text-xs text-zinc-300">EXC-{exc.id.split('-')[0]}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                    {exc.exception_code}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-300">{exc.source}</TableCell>
                <TableCell className="font-mono text-xs text-zinc-300">{exc.record_id}</TableCell>
                <TableCell className="text-zinc-300">${exc.amount.toFixed(2)}</TableCell>
                <TableCell className="text-zinc-300">{exc.age_days}d</TableCell>
                <TableCell>
                  <Badge variant="outline" className={exc.status === 'OPEN' ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}>
                    {exc.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {exc.status === 'OPEN' ? (
                    <Button variant="outline" size="sm" onClick={() => handleResolve(exc.id)} className="border-zinc-700 text-zinc-300 hover:text-white">
                      Resolve
                    </Button>
                  ) : (
                    <span className="text-xs text-zinc-500">Resolved</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {exceptions.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-zinc-500">
                  No exceptions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
