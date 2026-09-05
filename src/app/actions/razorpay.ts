"use server"

import { createClient } from "@/lib/supabase/server"

const getRazorpayHeaders = () => {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keyId || !keySecret) {
    throw new Error("Razorpay API keys are not configured in environment variables.")
  }

  const authString = Buffer.from(`${keyId}:${keySecret}`).toString("base64")
  return {
    Authorization: `Basic ${authString}`,
    "Content-Type": "application/json",
  }
}

export async function fetchLiveRazorpayPayments() {
  try {
    const headers = getRazorpayHeaders()
    const response = await fetch("https://api.razorpay.com/v1/payments?count=100", {
      headers,
      next: { revalidate: 0 },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to fetch from Razorpay API: ${errorText}`)
    }

    const data = await response.json()
    return { success: true, data: data.items }
  } catch (error: any) {
    console.error("Error fetching Razorpay live payments:", error)
    return { success: false, error: error.message }
  }
}

export async function syncRazorpayToDatabase(runId: string) {
  try {
    const paymentsResult = await fetchLiveRazorpayPayments()
    if (!paymentsResult.success || !paymentsResult.data) {
      throw new Error(paymentsResult.error || "Failed to fetch payments")
    }

    const supabase = await createClient()

    const mappedPayouts: any[] = []
    const mappedBankTxns: any[] = []
    const mappedLedgerEntries: any[] = []

    paymentsResult.data.forEach((payment: any, index: number) => {
      // Amounts are in smallest subunit (paise), so divide by 100
      const gross = payment.amount / 100
      const fee = (payment.fee || 0) / 100
      const tax = (payment.tax || 0) / 100
      const net = gross - fee - tax

      // Use notes or order_id as included_invoice_ids
      const invoiceId = payment.notes?.invoice_id || payment.order_id || `ORDER-${payment.id.slice(-6)}`
      const dateIso = new Date(payment.created_at * 1000).toISOString().split('T')[0]

      // 1. Processor Payout
      mappedPayouts.push({
        run_id: runId,
        payout_id: payment.id,
        payout_date: dateIso,
        gross_amount: gross,
        fee_amount: fee + tax,
        net_amount: net,
        currency: payment.currency || "INR",
        included_invoice_ids: [invoiceId],
      })

      // 2. Synthesized Bank Transaction (representing the net amount received)
      // We simulate a bank settlement that groups some payouts, or 1:1 for simplicity here.
      // Let's do 1:1 for demonstration.
      mappedBankTxns.push({
        run_id: runId,
        txn_id: `BANK-${payment.id}`,
        date: dateIso,
        amount: net,
        currency: payment.currency || "INR",
        counterparty_text: `RAZORPAY SETTLEMENT ${payment.id.slice(-6)}`,
        ref_code: payment.id,
      })

      // 3. Synthesized Ledger Entry (representing the gross sale)
      mappedLedgerEntries.push({
        run_id: runId,
        entry_id: `LEDGER-${payment.id}`,
        invoice_id: invoiceId,
        date: dateIso,
        amount: gross,
        currency: payment.currency || "INR",
        customer_name: payment.email || payment.contact || "Customer",
        status: "PENDING",
      })
    })

    if (mappedPayouts.length > 0) {
      // We will insert into all three tables. 
      // First, we need to create the run if it doesn't exist.
      // But runId is passed from the dashboard. Dashboard relies on an existing run.
      // If we are syncing from scratch, we might need a new run.
      // Assuming runId is valid.
      
      const { error: payoutError } = await supabase.from("processor_payouts").insert(mappedPayouts)
      if (payoutError) throw payoutError

      const { error: bankError } = await supabase.from("bank_transactions").insert(mappedBankTxns)
      if (bankError) throw bankError

      const { error: ledgerError } = await supabase.from("ledger_entries").insert(mappedLedgerEntries)
      if (ledgerError) throw ledgerError
    }

    return { success: true, count: mappedPayouts.length }
  } catch (error: any) {
    console.error("Error syncing to DB:", error)
    return { success: false, error: error.message }
  }
}
