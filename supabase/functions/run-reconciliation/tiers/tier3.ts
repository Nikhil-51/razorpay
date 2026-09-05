import { logAudit } from '../utils.ts'

export async function runTier3(supabase: any, run_id: string, bankTxns: any[], processorPayouts: any[], ledgerEntries: any[], settings: any) {
  const matches = []
  const remainingBankTxns = []
  
  for (const bank of bankTxns) {
    let matched = false
    
    const payout = processorPayouts.find(p => !p._matched && Math.abs(p.net_amount - bank.amount) <= settings.exact_amount_tolerance && p.currency === bank.currency)
    
    if (payout && payout.included_invoice_ids && payout.included_invoice_ids.length > 1) {
      const ledgers = ledgerEntries.filter(l => !l._matched && payout.included_invoice_ids.includes(l.invoice_id))
      
      if (ledgers.length === payout.included_invoice_ids.length) {
        const totalLedgerAmount = ledgers.reduce((sum, l) => sum + Number(l.amount), 0)
        
        if (Math.abs(totalLedgerAmount - Number(bank.amount)) <= settings.exact_amount_tolerance) {
          matches.push({
            run_id,
            bank_txn_id: bank.txn_id,
            processor_payout_id: payout.payout_id,
            ledger_entry_ids: ledgers.map(l => l.entry_id),
            invoice_ids: payout.included_invoice_ids,
            tier: 3,
            status: 'MATCHED',
            confidence: 0.95,
            amount_difference: Math.abs(totalLedgerAmount - Number(bank.amount)),
            date_difference: Math.abs(new Date(bank.date).getTime() - new Date(ledgers[0].date).getTime()) / (1000 * 3600 * 24),
            currency: bank.currency,
            discrepancy_type: 'MANY_TO_ONE',
            rationale: `Tier 3 — Aggregate Match\n✓ ${ledgers.length} invoices aggregate to exactly match processor net amount and bank deposit.`,
            matching_features: { aggregate_match: true, num_invoices: ledgers.length }
          })
          await logAudit(supabase, run_id, 'BANK', bank.txn_id, 'TIER_ATTEMPT', 3, 'MATCH', 0.95, 'Aggregate match successful')
          
          payout._matched = true
          ledgers.forEach(l => l._matched = true)
          matched = true
        }
      }
    }
    
    if (!matched) {
      await logAudit(supabase, run_id, 'BANK', bank.txn_id, 'TIER_ATTEMPT', 3, 'NO_MATCH', 0, 'No aggregate match found')
      remainingBankTxns.push(bank)
    }
  }
  
  return { matches, remainingBankTxns }
}
