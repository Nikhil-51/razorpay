import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { format, subDays, addDays } from "https://esm.sh/date-fns@2.30.0"

function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { seed = 42, user_id } = await req.json()
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const random = mulberry32(seed)
    
    const { data: run, error: runError } = await supabaseClient
      .from('reconciliation_runs')
      .insert({
        user_id,
        status: 'PENDING',
        dataset_seed: seed,
        total_records: 0
      })
      .select()
      .single()

    if (runError) throw runError

    const bankTxns = []
    const processorPayouts = []
    const ledgerEntries = []
    const groundTruths = []

    const baseDate = new Date()

    // Scenario 1: Clean 1:1
    for (let i=0; i<45; i++) {
        const id = `CLN-${1000+i}`
        const amount = 8000 + Math.floor(random() * 80000)
        const date = format(subDays(baseDate, Math.floor(random()*10)), 'yyyy-MM-dd')
        
        bankTxns.push({ run_id: run.id, txn_id: `BNK-${id}`, date, amount, currency: 'INR', counterparty_text: `Customer ${id}`, ref_code: id })
        processorPayouts.push({ run_id: run.id, payout_id: `pout_${id}`, payout_date: date, gross_amount: amount, fee_amount: 0, net_amount: amount, currency: 'INR', included_invoice_ids: [id] })
        ledgerEntries.push({ run_id: run.id, entry_id: `inv_${id}`, invoice_id: id, date, amount, currency: 'INR', customer_name: `Customer ${id}`, status: 'UNRECONCILED' })
        
        groundTruths.push({ run_id: run.id, source_type: 'BANK', source_record_id: `BNK-${id}`, match_type: '1:1', processor_id: `pout_${id}`, ledger_ids: [`inv_${id}`], discrepancy_type: 'CLEAN', expected_match: true })
    }

    // Scenario 2: Settlement lag
    const lagAmount = 40000
    const lagDate = baseDate
    const lagBankDate = format(addDays(lagDate, 2), 'yyyy-MM-dd')
    const lagLedgerDate = format(lagDate, 'yyyy-MM-dd')
    bankTxns.push({ run_id: run.id, txn_id: `BNK-LAG1`, date: lagBankDate, amount: lagAmount, currency: 'INR', counterparty_text: `Customer LAG`, ref_code: 'LAG1' })
    processorPayouts.push({ run_id: run.id, payout_id: `pout_LAG1`, payout_date: lagBankDate, gross_amount: lagAmount, fee_amount: 0, net_amount: lagAmount, currency: 'INR', included_invoice_ids: ['LAG1'] })
    ledgerEntries.push({ run_id: run.id, entry_id: `inv_LAG1`, invoice_id: 'LAG1', date: lagLedgerDate, amount: lagAmount, currency: 'INR', customer_name: `Customer LAG`, status: 'UNRECONCILED' })
    groundTruths.push({ run_id: run.id, source_type: 'BANK', source_record_id: `BNK-LAG1`, match_type: '1:1', processor_id: `pout_LAG1`, ledger_ids: [`inv_LAG1`], discrepancy_type: 'SETTLEMENT_LAG', expected_match: true })

    // Scenario 3: Processor fee mismatch
    bankTxns.push({ run_id: run.id, txn_id: `BNK-FEE1`, date: lagLedgerDate, amount: 77600, currency: 'INR', counterparty_text: `Customer FEE`, ref_code: 'FEE1' })
    processorPayouts.push({ run_id: run.id, payout_id: `pout_FEE1`, payout_date: lagLedgerDate, gross_amount: 80000, fee_amount: 2400, net_amount: 77600, currency: 'INR', included_invoice_ids: ['FEE1'] })
    ledgerEntries.push({ run_id: run.id, entry_id: `inv_FEE1`, invoice_id: 'FEE1', date: lagLedgerDate, amount: 80000, currency: 'INR', customer_name: `Customer FEE`, status: 'UNRECONCILED' })
    groundTruths.push({ run_id: run.id, source_type: 'BANK', source_record_id: `BNK-FEE1`, match_type: '1:1', processor_id: `pout_FEE1`, ledger_ids: [`inv_FEE1`], discrepancy_type: 'FEE_MISMATCH', expected_match: true })

    // Scenario 4: FX rounding
    bankTxns.push({ run_id: run.id, txn_id: `BNK-FX1`, date: lagLedgerDate, amount: 100003.2, currency: 'INR', counterparty_text: `Customer FX`, ref_code: 'FX1' })
    processorPayouts.push({ run_id: run.id, payout_id: `pout_FX1`, payout_date: lagLedgerDate, gross_amount: 100000, fee_amount: 0, net_amount: 100000, currency: 'INR', included_invoice_ids: ['FX1'] })
    ledgerEntries.push({ run_id: run.id, entry_id: `inv_FX1`, invoice_id: 'FX1', date: lagLedgerDate, amount: 100000, currency: 'INR', customer_name: `Customer FX`, status: 'UNRECONCILED' })
    groundTruths.push({ run_id: run.id, source_type: 'BANK', source_record_id: `BNK-FX1`, match_type: '1:1', processor_id: `pout_FX1`, ledger_ids: [`inv_FX1`], discrepancy_type: 'FX_ROUNDING', expected_match: true })

    // Scenario 5: Many-to-one
    bankTxns.push({ run_id: run.id, txn_id: `BNK-M21`, date: lagLedgerDate, amount: 160000, currency: 'INR', counterparty_text: `Customer M21`, ref_code: 'M21-BATCH' })
    processorPayouts.push({ run_id: run.id, payout_id: `pout_M21`, payout_date: lagLedgerDate, gross_amount: 160000, fee_amount: 0, net_amount: 160000, currency: 'INR', included_invoice_ids: ['M21A', 'M21B'] })
    ledgerEntries.push({ run_id: run.id, entry_id: `inv_M21A`, invoice_id: 'M21A', date: lagLedgerDate, amount: 120000, currency: 'INR', customer_name: `Customer M21`, status: 'UNRECONCILED' })
    ledgerEntries.push({ run_id: run.id, entry_id: `inv_M21B`, invoice_id: 'M21B', date: lagLedgerDate, amount: 40000, currency: 'INR', customer_name: `Customer M21`, status: 'UNRECONCILED' })
    groundTruths.push({ run_id: run.id, source_type: 'BANK', source_record_id: `BNK-M21`, match_type: 'MANY_TO_ONE', processor_id: `pout_M21`, ledger_ids: [`inv_M21A`, `inv_M21B`], discrepancy_type: 'MANY_TO_ONE', expected_match: true })

    // Scenario 6: Duplicate ledger
    bankTxns.push({ run_id: run.id, txn_id: `BNK-DUP1`, date: lagLedgerDate, amount: 64000, currency: 'INR', counterparty_text: `Customer DUP`, ref_code: 'DUP1' })
    processorPayouts.push({ run_id: run.id, payout_id: `pout_DUP1`, payout_date: lagLedgerDate, gross_amount: 64000, fee_amount: 0, net_amount: 64000, currency: 'INR', included_invoice_ids: ['DUP1'] })
    ledgerEntries.push({ run_id: run.id, entry_id: `inv_DUP1A`, invoice_id: 'DUP1', date: lagLedgerDate, amount: 64000, currency: 'INR', customer_name: `Customer DUP`, status: 'UNRECONCILED' })
    ledgerEntries.push({ run_id: run.id, entry_id: `inv_DUP1B`, invoice_id: 'DUP1', date: lagLedgerDate, amount: 64000, currency: 'INR', customer_name: `Customer DUP`, status: 'UNRECONCILED' })
    groundTruths.push({ run_id: run.id, source_type: 'BANK', source_record_id: `BNK-DUP1`, match_type: '1:1', processor_id: `pout_DUP1`, ledger_ids: [`inv_DUP1A`], discrepancy_type: 'DUPLICATE', expected_match: true })

    // Scenario 7: Bank-only
    bankTxns.push({ run_id: run.id, txn_id: `BNK-ONLY1`, date: lagLedgerDate, amount: 1200, currency: 'INR', counterparty_text: `MAINTENANCE FEE`, ref_code: 'FEE-OCT' })
    groundTruths.push({ run_id: run.id, source_type: 'BANK', source_record_id: `BNK-ONLY1`, match_type: 'NONE', processor_id: null, ledger_ids: [], discrepancy_type: 'BANK_ONLY', expected_match: false })

    // Scenario 8: Ledger-only
    ledgerEntries.push({ run_id: run.id, entry_id: `inv_ONLY1`, invoice_id: 'ONLY1', date: lagLedgerDate, amount: 36000, currency: 'INR', customer_name: `Customer ONLY`, status: 'UNRECONCILED' })
    groundTruths.push({ run_id: run.id, source_type: 'LEDGER', source_record_id: `inv_ONLY1`, match_type: 'NONE', processor_id: null, ledger_ids: [], discrepancy_type: 'LEDGER_ONLY', expected_match: false })

    // Scenario 9: Garbled reference
    bankTxns.push({ run_id: run.id, txn_id: `BNK-GARB`, date: lagLedgerDate, amount: 26640, currency: 'INR', counterparty_text: `RAZORPAY SOFTWARE INV333X`, ref_code: 'GARB1' })
    processorPayouts.push({ run_id: run.id, payout_id: `pout_GARB`, payout_date: lagLedgerDate, gross_amount: 26640, fee_amount: 0, net_amount: 26640, currency: 'INR', included_invoice_ids: ['INV-333'] })
    ledgerEntries.push({ run_id: run.id, entry_id: `inv_GARB`, invoice_id: 'INV-333', date: lagLedgerDate, amount: 26640, currency: 'INR', customer_name: `Razorpay Software Private Limited`, status: 'UNRECONCILED' })
    groundTruths.push({ run_id: run.id, source_type: 'BANK', source_record_id: `BNK-GARB`, match_type: 'FUZZY', processor_id: `pout_GARB`, ledger_ids: [`inv_GARB`], discrepancy_type: 'GARBLED_REF', expected_match: true })

    // Scenario 10: Month-end boundary
    const lastDayOfMonth = '2026-08-31'
    const firstDayOfNextMonth = '2026-09-01'
    bankTxns.push({ run_id: run.id, txn_id: `BNK-ME1`, date: firstDayOfNextMonth, amount: 62160, currency: 'INR', counterparty_text: `Customer ME`, ref_code: 'ME1' })
    processorPayouts.push({ run_id: run.id, payout_id: `pout_ME1`, payout_date: firstDayOfNextMonth, gross_amount: 62160, fee_amount: 0, net_amount: 62160, currency: 'INR', included_invoice_ids: ['ME1'] })
    ledgerEntries.push({ run_id: run.id, entry_id: `inv_ME1`, invoice_id: 'ME1', date: lastDayOfMonth, amount: 62160, currency: 'INR', customer_name: `Customer ME`, status: 'UNRECONCILED' })
    groundTruths.push({ run_id: run.id, source_type: 'BANK', source_record_id: `BNK-ME1`, match_type: '1:1', processor_id: `pout_ME1`, ledger_ids: [`inv_ME1`], discrepancy_type: 'MONTH_END', expected_match: true })

    // Insert batches (chunks of 100 would be better, but we have < 100)
    await supabaseClient.from('bank_transactions').insert(bankTxns)
    await supabaseClient.from('processor_payouts').insert(processorPayouts)
    await supabaseClient.from('ledger_entries').insert(ledgerEntries)
    await supabaseClient.from('ground_truth').insert(groundTruths)

    const totalRecords = bankTxns.length + processorPayouts.length + ledgerEntries.length
    await supabaseClient.from('reconciliation_runs').update({ total_records: totalRecords }).eq('id', run.id)

    return new Response(JSON.stringify({ success: true, run_id: run.id, records: totalRecords }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
