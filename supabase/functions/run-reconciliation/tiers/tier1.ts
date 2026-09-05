import { logAudit } from '../utils.ts'

export async function runTier1(supabase: any, run_id: string, bankTxns: any[], processorPayouts: any[], ledgerEntries: any[], settings: any) {
  const matches = []
  const remainingBankTxns = []
  
  for (const bank of bankTxns) {
    let matched = false
    
    const payout = processorPayouts.find(p => 
      !p._matched && 
      Math.abs(p.net_amount - bank.amount) <= settings.exact_amount_tolerance && 
      p.currency === bank.currency && 
      p.included_invoice_ids.includes(bank.ref_code)
    )
    
    const ledger = ledgerEntries.find(l => 
      !l._matched && 
      Math.abs(l.amount - bank.amount) <= settings.exact_amount_tolerance && 
      l.currency === bank.currency && 
      l.invoice_id === bank.ref_code
    )

    if (payout && ledger) {
      matches.push({
        run_id,
        bank_txn_id: bank.txn_id,
        processor_payout_id: payout.payout_id,
        ledger_entry_ids: [ledger.entry_id],
        invoice_ids: [bank.ref_code],
        tier: 1,
        status: 'MATCHED',
        confidence: 1.0,
        amount_difference: Math.abs(ledger.amount - bank.amount),
        date_difference: Math.abs(new Date(bank.date).getTime() - new Date(ledger.date).getTime()) / (1000 * 3600 * 24),
        currency: bank.currency,
        discrepancy_type: 'CLEAN',
        rationale: 'Tier 1 — Exact Match',
        matching_features: { exact_amount: true, exact_ref: true, exact_currency: true }
      })
      await logAudit(supabase, run_id, 'BANK', bank.txn_id, 'TIER_ATTEMPT', 1, 'MATCH', 1.0, 'Exact match found')
      
      payout._matched = true
      ledger._matched = true
      matched = true
    } else {
      await logAudit(supabase, run_id, 'BANK', bank.txn_id, 'TIER_ATTEMPT', 1, 'NO_MATCH', 0, 'No exact match')
      remainingBankTxns.push(bank)
    }
  }
  
  return { matches, remainingBankTxns }
}
