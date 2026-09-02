-- Enable Row Level Security
alter table reconciliation_runs enable row level security;
alter table bank_transactions enable row level security;
alter table processor_payouts enable row level security;
alter table ledger_entries enable row level security;
alter table reconciliation_matches enable row level security;
alter table exceptions enable row level security;
alter table audit_logs enable row level security;
alter table reconciliation_settings enable row level security;

-- NOTE: ground_truth intentionally DOES NOT have RLS policies for authenticated users.
-- It will be accessed only by service_role in edge functions.
alter table ground_truth enable row level security; -- Enable it so by default no one can access it, only service_role bypassing RLS.

-- Policies for reconciliation_runs
create policy "Users can view own runs" on reconciliation_runs for select using (auth.uid() = user_id);
create policy "Users can insert own runs" on reconciliation_runs for insert with check (auth.uid() = user_id);
create policy "Users can update own runs" on reconciliation_runs for update using (auth.uid() = user_id);
create policy "Users can delete own runs" on reconciliation_runs for delete using (auth.uid() = user_id);

-- Policies for settings
create policy "Users can view own settings" on reconciliation_settings for select using (auth.uid() = user_id);
create policy "Users can insert own settings" on reconciliation_settings for insert with check (auth.uid() = user_id);
create policy "Users can update own settings" on reconciliation_settings for update using (auth.uid() = user_id);

-- Helper function to check run ownership (for performance, though inline exists is fine)

-- Policies for bank_transactions
create policy "Users can view own bank_transactions" on bank_transactions for select using (
    exists (select 1 from reconciliation_runs where id = bank_transactions.run_id and user_id = auth.uid())
);
create policy "Users can insert own bank_transactions" on bank_transactions for insert with check (
    exists (select 1 from reconciliation_runs where id = bank_transactions.run_id and user_id = auth.uid())
);

-- Policies for processor_payouts
create policy "Users can view own processor_payouts" on processor_payouts for select using (
    exists (select 1 from reconciliation_runs where id = processor_payouts.run_id and user_id = auth.uid())
);
create policy "Users can insert own processor_payouts" on processor_payouts for insert with check (
    exists (select 1 from reconciliation_runs where id = processor_payouts.run_id and user_id = auth.uid())
);

-- Policies for ledger_entries
create policy "Users can view own ledger_entries" on ledger_entries for select using (
    exists (select 1 from reconciliation_runs where id = ledger_entries.run_id and user_id = auth.uid())
);
create policy "Users can insert own ledger_entries" on ledger_entries for insert with check (
    exists (select 1 from reconciliation_runs where id = ledger_entries.run_id and user_id = auth.uid())
);

-- Policies for reconciliation_matches
create policy "Users can view own reconciliation_matches" on reconciliation_matches for select using (
    exists (select 1 from reconciliation_runs where id = reconciliation_matches.run_id and user_id = auth.uid())
);

-- Policies for exceptions
create policy "Users can view own exceptions" on exceptions for select using (
    exists (select 1 from reconciliation_runs where id = exceptions.run_id and user_id = auth.uid())
);
create policy "Users can update own exceptions" on exceptions for update using (
    exists (select 1 from reconciliation_runs where id = exceptions.run_id and user_id = auth.uid())
);

-- Policies for audit_logs
create policy "Users can view own audit_logs" on audit_logs for select using (
    exists (select 1 from reconciliation_runs where id = audit_logs.run_id and user_id = auth.uid())
);
