"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function ReportsPage() {
  const [loadingType, setLoadingType] = useState<string | null>(null)
  const supabase = createClient()

  const jsonToCsv = (jsonArray: any[]) => {
    if (!jsonArray || jsonArray.length === 0) return ""
    const keys = Object.keys(jsonArray[0])
    const csvContent = [
      keys.join(","),
      ...jsonArray.map(row => keys.map(key => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))
    ].join("\n")
    return csvContent
  }

  const downloadFile = (content: string, filename: string, mimeType: string = 'text/csv') => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleDownload = async (type: string) => {
    setLoadingType(type)
    try {
      if (type === 'summary' || type === 'scoring') {
        const { data: runs, error } = await supabase
          .from('reconciliation_runs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10)
        
        if (error) throw error
        
        let exportData = runs || []
        
        if (type === 'scoring') {
           exportData = exportData.map(run => ({
             Run_ID: run.id,
             Date: new Date(run.created_at).toLocaleString(),
             Total_Records: run.total_records,
             Matched: run.matched_records,
             Exceptions: run.exception_records,
             Match_Rate: `${run.match_rate}%`,
             Precision: run.precision,
             Recall: run.recall,
             F1_Score: run.f1,
             Yield: run.exception_yield,
           }))
        } else {
           exportData = exportData.map(run => ({
             Run_ID: run.id,
             Date: new Date(run.created_at).toLocaleString(),
             Status: run.status,
             Total_Records: run.total_records,
             Matched: run.matched_records,
             Exceptions: run.exception_records,
             Execution_Time_MS: run.execution_time_ms
           }))
        }
        
        const csv = jsonToCsv(exportData)
        downloadFile(csv, `r3con_${type}_${new Date().toISOString().split('T')[0]}.csv`)
      } 
      
      else if (type === 'matches') {
        const { data: latestRun } = await supabase.from('reconciliation_runs').select('id').order('created_at', { ascending: false }).limit(1).single()
        if (!latestRun) throw new Error("No runs found")
        
        const { data: matches, error } = await supabase
          .from('reconciliation_matches')
          .select('bank_txn_id, processor_payout_id, ledger_entry_ids, status, confidence, amount_difference, discrepancy_type')
          .eq('run_id', latestRun.id)
          
        if (error) throw error
        
        const exportData = matches.map(m => ({
          Bank_Txn_ID: m.bank_txn_id,
          Processor_ID: m.processor_payout_id,
          Ledger_IDs: Array.isArray(m.ledger_entry_ids) ? m.ledger_entry_ids.join(';') : m.ledger_entry_ids,
          Status: m.status,
          Confidence: m.confidence,
          Amount_Difference: m.amount_difference,
          Discrepancy_Type: m.discrepancy_type
        }))
        
        const csv = jsonToCsv(exportData)
        downloadFile(csv, `r3con_matches_${latestRun.id}.csv`)
      }

      else if (type === 'exceptions') {
        const { data: exceptions, error } = await supabase
          .from('exceptions')
          .select('source_type, record_id, amount, currency, status, reason, created_at')
          .eq('status', 'OPEN')
          .order('created_at', { ascending: false })
          
        if (error) throw error
        
        const exportData = exceptions.map(e => ({
          Source: e.source_type,
          Record_ID: e.record_id,
          Amount: e.amount,
          Currency: e.currency,
          Status: e.status,
          Reason: e.reason,
          Date_Created: new Date(e.created_at).toLocaleString()
        }))
        
        const csv = jsonToCsv(exportData)
        downloadFile(csv, `r3con_open_exceptions_${new Date().toISOString().split('T')[0]}.csv`)
      }
      
    } catch (e: any) {
      console.error(e)
      alert(`Download failed: ${e.message}`)
    } finally {
      setLoadingType(null)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Reports</h1>
        <p className="text-zinc-400">Download system generated reports and audit logs</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
          <CardHeader>
            <CardTitle className="text-white">Reconciliation Summary</CardTitle>
            <CardDescription className="text-zinc-400">CSV summary of the latest reconciliation runs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleDownload('summary')} disabled={loadingType === 'summary'} className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0 transition-colors">
              {loadingType === 'summary' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {loadingType === 'summary' ? "Generating..." : "Download Summary"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
          <CardHeader>
            <CardTitle className="text-white">Scoring Report</CardTitle>
            <CardDescription className="text-zinc-400">Detailed metric breakdown against ground truth.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleDownload('scoring')} disabled={loadingType === 'scoring'} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white border-0 transition-colors">
              {loadingType === 'scoring' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {loadingType === 'scoring' ? "Generating..." : "Download Scoring Report"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
          <CardHeader>
            <CardTitle className="text-white">Matched Pairs</CardTitle>
            <CardDescription className="text-zinc-400">CSV export of all successfully matched records from the latest run.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleDownload('matches')} disabled={loadingType === 'matches'} variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
              {loadingType === 'matches' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {loadingType === 'matches' ? "Generating..." : "Download Matched Pairs CSV"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
          <CardHeader>
            <CardTitle className="text-white">Exceptions Queue</CardTitle>
            <CardDescription className="text-zinc-400">CSV export of all currently OPEN exceptions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleDownload('exceptions')} disabled={loadingType === 'exceptions'} variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
              {loadingType === 'exceptions' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {loadingType === 'exceptions' ? "Generating..." : "Download Exceptions CSV"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
