"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { fetchLiveRazorpayPayments, syncRazorpayToDatabase } from "@/app/actions/razorpay"
import { RefreshCcw } from "lucide-react"

export default function TransactionsPage() {
  const [bankTxns, setBankTxns] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [ledgers, setLedgers] = useState<any[]>([])
  const [liveRazorpay, setLiveRazorpay] = useState<any[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const [{ data: bank }, { data: proc }, { data: led }] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('date', { ascending: false }).limit(100),
      supabase.from('processor_payouts').select('*').order('payout_date', { ascending: false }).limit(100),
      supabase.from('ledger_entries').select('*').order('date', { ascending: false }).limit(100)
    ])
    if (bank) setBankTxns(bank)
    if (proc) setPayouts(proc)
    if (led) setLedgers(led)

    // Fetch live Razorpay data safely
    const live = await fetchLiveRazorpayPayments()
    if (live.success && live.data) {
      setLiveRazorpay(live.data)
      setLiveError(null)
    } else if (live.error) {
      setLiveError(live.error)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    const runId = "default" // If there's an active run, we'd use it here.
    const res = await syncRazorpayToDatabase(runId)
    setIsSyncing(false)
    if (res.success) {
      alert(`Successfully synced ${res.count} transactions!`)
      fetchData() // refresh the tables
    } else {
      alert(`Sync failed: ${res.error}`)
    }
  }

  const formatAmount = (amount: number, currency: string = "INR") => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Source Transactions</h1>
          <p className="text-zinc-400">View raw data from your connected sources</p>
        </div>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCcw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? "Syncing..." : "Sync from Razorpay"}
        </button>
      </div>

      <Tabs defaultValue="bank" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="bank" className="data-[state=active]:bg-zinc-800">Bank Statement</TabsTrigger>
          <TabsTrigger value="processor" className="data-[state=active]:bg-zinc-800">Payment Processor</TabsTrigger>
          <TabsTrigger value="ledger" className="data-[state=active]:bg-zinc-800">Internal Ledger</TabsTrigger>
          <TabsTrigger value="live_razorpay" className="data-[state=active]:bg-zinc-800 text-blue-400">Live API Data</TabsTrigger>
        </TabsList>

        <TabsContent value="bank" className="mt-6">
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Ref Code</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankTxns.map((txn) => (
                  <TableRow key={txn.id} className="border-zinc-800">
                    <TableCell className="font-mono text-xs">{txn.txn_id}</TableCell>
                    <TableCell>{txn.date}</TableCell>
                    <TableCell>{txn.counterparty_text}</TableCell>
                    <TableCell className="font-mono text-xs">{txn.ref_code}</TableCell>
                    <TableCell className="text-right">{formatAmount(txn.amount, txn.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="processor" className="mt-6">
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead>Payout ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id} className="border-zinc-800">
                    <TableCell className="font-mono text-xs">{p.payout_id}</TableCell>
                    <TableCell>{p.payout_date}</TableCell>
                    <TableCell>{formatAmount(p.gross_amount, p.currency)}</TableCell>
                    <TableCell className="text-red-400">-{formatAmount(p.fee_amount, p.currency)}</TableCell>
                    <TableCell className="text-right font-medium">{formatAmount(p.net_amount, p.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="ledger" className="mt-6">
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead>Entry ID</TableHead>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgers.map((l) => (
                  <TableRow key={l.id} className="border-zinc-800">
                    <TableCell className="font-mono text-xs">{l.entry_id}</TableCell>
                    <TableCell className="font-mono text-xs">{l.invoice_id}</TableCell>
                    <TableCell>{l.date}</TableCell>
                    <TableCell>{l.customer_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={l.status === 'RECONCILED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatAmount(l.amount, l.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="live_razorpay" className="mt-6">
          {liveError ? (
            <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400">
              <h3 className="font-medium mb-1">Failed to fetch live data</h3>
              <p className="text-sm opacity-80">{liveError}</p>
              <p className="text-sm mt-2">Make sure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set in your .env.local file.</p>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead>Payment ID</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Order ID / Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead className="text-right">Net Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveRazorpay.map((p) => {
                    const gross = p.amount / 100
                    const feeAndTax = ((p.fee || 0) + (p.tax || 0)) / 100
                    const net = gross - feeAndTax
                    const invoiceId = p.notes?.invoice_id || p.order_id || 'N/A'

                    return (
                      <TableRow key={p.id} className="border-zinc-800">
                        <TableCell className="font-mono text-xs">{p.id}</TableCell>
                        <TableCell>{new Date(p.created_at * 1000).toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-xs">{invoiceId}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={p.status === 'captured' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}>
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatAmount(gross, p.currency)}</TableCell>
                        <TableCell className="text-red-400">-{formatAmount(feeAndTax, p.currency)}</TableCell>
                        <TableCell className="text-right font-medium">{formatAmount(net, p.currency)}</TableCell>
                      </TableRow>
                    )
                  })}
                  {liveRazorpay.length === 0 && !liveError && (
                    <TableRow className="border-zinc-800">
                      <TableCell colSpan={7} className="text-center py-8 text-zinc-500">
                        No transactions found or loading...
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
