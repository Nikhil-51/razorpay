import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from '../run-reconciliation/utils.ts'
import { calculateScores } from '../run-reconciliation/scoring.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { run_id } = await req.json()
    if (!run_id) throw new Error('run_id is required')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) {
        throw new Error('GEMINI_API_KEY is missing. Please add it to your environment variables.')
    }

    const startTime = performance.now()
    await supabase.from('reconciliation_runs').update({ status: 'RUNNING', started_at: new Date().toISOString() }).eq('id', run_id)

    const { data: run } = await supabase.from('reconciliation_runs').select('*').eq('id', run_id).single()
    const { data: bankTxns } = await supabase.from('bank_transactions').select('*').eq('run_id', run_id)
    const { data: processorPayouts } = await supabase.from('processor_payouts').select('*').eq('run_id', run_id)
    const { data: ledgerEntries } = await supabase.from('ledger_entries').select('*').eq('run_id', run_id)

    // Format records for prompt
    const bankStr = JSON.stringify(bankTxns.map((b: any) => ({ txn_id: b.txn_id, amount: b.amount, currency: b.currency, date: b.date, counterparty: b.counterparty_text, ref: b.ref_code })))
    const procStr = JSON.stringify(processorPayouts.map((p: any) => ({ payout_id: p.payout_id, net_amount: p.net_amount, gross_amount: p.gross_amount, fee: p.fee_amount, currency: p.currency, date: p.payout_date, invoice_ids: p.included_invoice_ids })))
    const ledgStr = JSON.stringify(ledgerEntries.map((l: any) => ({ entry_id: l.entry_id, amount: l.amount, currency: l.currency, date: l.date, invoice_id: l.invoice_id, name: l.customer_name })))

    const prompt = `You are an expert AI Finance-Ops Reconciliation Agent.
Your task is to reconcile these 3 datasets: Bank Transactions, Processor Payouts, and Ledger Entries.
Here are the rules for reconciliation:
1. Exact Match: Amounts and Dates match exactly.
2. Settlement Lag: Bank date is a few days after Ledger/Processor date.
3. Fee Mismatch: Bank amount = Processor gross - fee. Processor net might differ slightly due to rounding or missing tax. Ledger amount is usually gross.
4. FX Rounding: Bank amount is slightly off from Processor/Ledger due to exchange rate rounding.
5. Many-to-One: One Bank txn maps to ONE Processor payout which maps to MULTIPLE Ledger entries whose amounts sum up to the payout.
6. Garbled Reference: The bank counterparty text is garbled but string similarity strongly matches a ledger entry.

Datasets:
BANK TRANSACTIONS:
${bankStr}

PROCESSOR PAYOUTS:
${procStr}

LEDGER ENTRIES:
${ledgStr}

Output STRICTLY valid JSON with the following schema:
{
  "matches": [
    {
      "bank_txn_id": "BNK-...",
      "processor_payout_id": "pout_...",
      "ledger_entry_ids": ["inv_..."],
      "discrepancy_type": "CLEAN" | "SETTLEMENT_LAG" | "FEE_MISMATCH" | "FX_ROUNDING" | "MANY_TO_ONE" | "GARBLED_REF",
      "rationale": "Explanation for the match"
    }
  ],
  "exceptions": [
    {
      "source_type": "BANK" | "LEDGER" | "PROCESSOR",
      "record_id": "BNK-...",
      "reason": "Detailed explanation of why it could not be matched"
    }
  ]
}

DO NOT output markdown, ONLY the raw JSON object.`

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        })
    })

    if (!geminiResponse.ok) {
        const errStr = await geminiResponse.text()
        throw new Error(`Gemini Error: ${errStr}`)
    }

    const aiData = await geminiResponse.json()
    const aiContent = aiData.candidates[0].content.parts[0].text
    let parsed
    try {
        parsed = JSON.parse(aiContent)
    } catch (e) {
        throw new Error(`Failed to parse AI response as JSON: ${aiContent}`)
    }

    const { matches = [], exceptions = [] } = parsed

    // Prepare inserts
    const dbMatches = matches.map((m: any) => {
        // Find corresponding records to calculate differences
        const bank = bankTxns.find((b: any) => b.txn_id === m.bank_txn_id)
        const ledgers = ledgerEntries.filter((l: any) => m.ledger_entry_ids.includes(l.entry_id))
        const ledgerAmount = ledgers.reduce((sum: number, l: any) => sum + l.amount, 0)

        return {
            run_id,
            bank_txn_id: m.bank_txn_id,
            processor_payout_id: m.processor_payout_id,
            ledger_entry_ids: m.ledger_entry_ids,
            invoice_ids: ledgers.map((l: any) => l.invoice_id),
            tier: 5, // AI Tier
            status: 'MATCHED',
            confidence: 0.99,
            amount_difference: bank ? Math.abs(ledgerAmount - bank.amount) : 0,
            date_difference: 0,
            currency: bank?.currency || 'INR',
            discrepancy_type: m.discrepancy_type || 'AI_MATCH',
            rationale: `AI Agent: ${m.rationale}`,
            matching_features: { ai_matched: true }
        }
    })

    const dbExceptions = exceptions.map((e: any) => {
        let amount = 0, currency = 'INR', date = new Date().toISOString().split('T')[0]
        if (e.source_type === 'BANK') {
            const b = bankTxns.find((x: any) => x.txn_id === e.record_id)
            if (b) { amount = b.amount; currency = b.currency; date = b.date }
        } else if (e.source_type === 'LEDGER') {
            const l = ledgerEntries.find((x: any) => x.entry_id === e.record_id)
            if (l) { amount = l.amount; currency = l.currency; date = l.date }
        } else if (e.source_type === 'PROCESSOR') {
            const p = processorPayouts.find((x: any) => x.payout_id === e.record_id)
            if (p) { amount = p.net_amount; currency = p.currency; date = p.payout_date }
        }
        
        return {
            run_id,
            source_type: e.source_type,
            record_id: e.record_id,
            amount,
            currency,
            date,
            status: 'UNRESOLVED',
            reason: e.reason
        }
    })

    if (dbMatches.length > 0) await supabase.from('reconciliation_matches').insert(dbMatches)
    if (dbExceptions.length > 0) await supabase.from('exceptions').insert(dbExceptions)

    // Update ledgers
    const matchedLedgerIds = matches.flatMap((m: any) => m.ledger_entry_ids)
    if (matchedLedgerIds.length > 0) {
      await supabase.from('ledger_entries').update({ status: 'RECONCILED' }).in('entry_id', matchedLedgerIds)
    }

    const scores = await calculateScores(supabase, run_id, dbMatches, dbExceptions)
    
    const endTime = performance.now()
    const executionTimeMs = endTime - startTime
    const throughput = (run.total_records || 1) / (executionTimeMs / 1000)

    await supabase.from('reconciliation_runs').update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      matched_records: dbMatches.length,
      exception_records: dbExceptions.length,
      match_rate: ((dbMatches.length / Math.max(1, (run.total_records || 1))) * 100),
      precision: scores.precision,
      recall: scores.recall,
      f1: scores.f1,
      exception_yield: scores.exception_yield,
      execution_time_ms: executionTimeMs,
      throughput: throughput
    }).eq('id', run_id)

    return new Response(JSON.stringify({ success: true, run_id, matches: dbMatches.length, exceptions: dbExceptions.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
