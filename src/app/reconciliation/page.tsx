"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"

export default function ReconciliationPage() {
  const [matches, setMatches] = useState<any[]>([])
  const [selectedMatch, setSelectedMatch] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchMatches()
  }, [])

  const fetchMatches = async () => {
    const { data } = await supabase.from('reconciliation_matches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (data) setMatches(data)
  }

  const getTierBadge = (tier: number) => {
    const colors = {
      1: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      2: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      3: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
      4: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    }
    const labels = { 1: "Exact", 2: "Tolerance", 3: "Aggregate", 4: "Narrative" }
    return <Badge variant="outline" className={colors[tier as keyof typeof colors]}>Tier {tier} — {labels[tier as keyof typeof labels]}</Badge>
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Three-Way Reconciliation</h1>
        <p className="text-zinc-400">Bank ↔ Processor ↔ Ledger</p>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-zinc-800/50">
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-zinc-400">Bank Txn</TableHead>
              <TableHead className="text-zinc-400">Processor</TableHead>
              <TableHead className="text-zinc-400">Invoice(s)</TableHead>
              <TableHead className="text-zinc-400">Diff</TableHead>
              <TableHead className="text-zinc-400">Tier</TableHead>
              <TableHead className="text-zinc-400 text-right">Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((match) => (
              <TableRow 
                key={match.id} 
                className="border-zinc-800 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                onClick={() => setSelectedMatch(match)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="font-medium text-zinc-100">{match.status}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-300">{match.bank_txn_id}</TableCell>
                <TableCell className="font-mono text-xs text-zinc-300">{match.processor_payout_id}</TableCell>
                <TableCell className="font-mono text-xs text-zinc-300">{match.invoice_ids?.join(', ')}</TableCell>
                <TableCell className="text-zinc-300">{match.amount_difference > 0 ? `$${match.amount_difference.toFixed(2)}` : '$0.00'}</TableCell>
                <TableCell>{getTierBadge(match.tier)}</TableCell>
                <TableCell className="text-right text-zinc-300">{(match.confidence * 100).toFixed(0)}%</TableCell>
              </TableRow>
            ))}
            {matches.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-zinc-500">
                  No matches found. Run reconciliation to populate.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selectedMatch} onOpenChange={(open) => !open && setSelectedMatch(null)}>
        <SheetContent className="bg-zinc-950 border-zinc-800 w-[500px] sm:max-w-[500px] text-zinc-100 overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-white">Reconciliation Detail</SheetTitle>
            <SheetDescription className="text-zinc-400">
              Detailed evidence for this match.
            </SheetDescription>
          </SheetHeader>
          
          {selectedMatch && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-zinc-500 uppercase font-semibold mb-1">Status</div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="font-medium">{selectedMatch.status}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 uppercase font-semibold mb-1">Confidence</div>
                  <div className="font-medium text-lg">{(selectedMatch.confidence * 100).toFixed(1)}%</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500 uppercase font-semibold mb-1">Tier</div>
                {getTierBadge(selectedMatch.tier)}
              </div>

              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg whitespace-pre-line text-sm text-zinc-300 font-mono">
                {selectedMatch.rationale}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b border-zinc-800 pb-2">Records</h3>
                
                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-xs text-emerald-500 font-semibold mb-2">BANK</div>
                  <div className="font-mono text-sm">{selectedMatch.bank_txn_id}</div>
                </div>

                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-xs text-blue-500 font-semibold mb-2">PROCESSOR</div>
                  <div className="font-mono text-sm">{selectedMatch.processor_payout_id}</div>
                </div>

                <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="text-xs text-indigo-500 font-semibold mb-2">LEDGER</div>
                  <div className="font-mono text-sm space-y-1">
                    {selectedMatch.ledger_entry_ids?.map((id: string) => (
                      <div key={id}>{id}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
