-- Indexes for bank_transactions
create index idx_bank_transactions_run_id on bank_transactions(run_id);
create index idx_bank_transactions_txn_id on bank_transactions(txn_id);
create index idx_bank_transactions_date on bank_transactions(date);
create index idx_bank_transactions_currency on bank_transactions(currency);
create index idx_bank_transactions_amount on bank_transactions(amount);

-- Indexes for processor_payouts
create index idx_processor_payouts_run_id on processor_payouts(run_id);
create index idx_processor_payouts_payout_id on processor_payouts(payout_id);
create index idx_processor_payouts_payout_date on processor_payouts(payout_date);
create index idx_processor_payouts_currency on processor_payouts(currency);

-- Indexes for ledger_entries
create index idx_ledger_entries_run_id on ledger_entries(run_id);
create index idx_ledger_entries_entry_id on ledger_entries(entry_id);
create index idx_ledger_entries_invoice_id on ledger_entries(invoice_id);
create index idx_ledger_entries_date on ledger_entries(date);
create index idx_ledger_entries_currency on ledger_entries(currency);

-- Indexes for exceptions
create index idx_exceptions_run_id on exceptions(run_id);
create index idx_exceptions_status on exceptions(status);

-- Indexes for reconciliation_matches
create index idx_reconciliation_matches_run_id on reconciliation_matches(run_id);

-- Indexes for ground_truth
create index idx_ground_truth_run_id on ground_truth(run_id);
