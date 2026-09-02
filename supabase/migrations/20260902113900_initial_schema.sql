create table reconciliation_runs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    created_at timestamptz default now(),
    started_at timestamptz,
    completed_at timestamptz,
    status text,
    dataset_seed integer,
    total_records integer,
    matched_records integer,
    exception_records integer,
    match_rate numeric,
    precision numeric,
    recall numeric,
    f1 numeric,
    exception_yield numeric,
    throughput numeric,
    execution_time_ms numeric
);

create table bank_transactions (
    id uuid primary key default gen_random_uuid(),
    run_id uuid references reconciliation_runs(id) on delete cascade,
    txn_id text,
    date date,
    amount numeric,
    currency text,
    counterparty_text text,
    ref_code text,
    created_at timestamptz default now()
);

create table processor_payouts (
    id uuid primary key default gen_random_uuid(),
    run_id uuid references reconciliation_runs(id) on delete cascade,
    payout_id text,
    payout_date date,
    gross_amount numeric,
    fee_amount numeric,
    net_amount numeric,
    currency text,
    included_invoice_ids text[],
    created_at timestamptz default now()
);

create table ledger_entries (
    id uuid primary key default gen_random_uuid(),
    run_id uuid references reconciliation_runs(id) on delete cascade,
    entry_id text,
    invoice_id text,
    date date,
    amount numeric,
    currency text,
    customer_name text,
    status text,
    created_at timestamptz default now()
);

create table ground_truth (
    id uuid primary key default gen_random_uuid(),
    run_id uuid references reconciliation_runs(id) on delete cascade,
    source_type text,
    source_record_id text,
    match_type text,
    processor_id text,
    ledger_ids text[],
    discrepancy_type text,
    expected_match boolean,
    created_at timestamptz default now()
);

create table reconciliation_matches (
    id uuid primary key default gen_random_uuid(),
    run_id uuid references reconciliation_runs(id) on delete cascade,
    bank_txn_id text,
    processor_payout_id text,
    ledger_entry_ids text[],
    invoice_ids text[],
    tier integer,
    status text,
    confidence numeric,
    amount_difference numeric,
    date_difference integer,
    currency text,
    discrepancy_type text,
    rationale text,
    matching_features jsonb,
    created_at timestamptz default now()
);

create table exceptions (
    id uuid primary key default gen_random_uuid(),
    run_id uuid references reconciliation_runs(id) on delete cascade,
    exception_code text,
    source text,
    record_id text,
    amount numeric,
    currency text,
    date date,
    related_candidate_ids text[],
    confidence numeric,
    suggested_action text,
    age_days integer,
    status text,
    resolution text,
    resolved_by uuid references auth.users(id),
    resolved_at timestamptz,
    created_at timestamptz default now()
);

create table audit_logs (
    id uuid primary key default gen_random_uuid(),
    run_id uuid references reconciliation_runs(id) on delete cascade,
    record_type text,
    record_id text,
    action text,
    tier integer,
    decision text,
    confidence numeric,
    reason text,
    metadata jsonb,
    created_at timestamptz default now()
);

create table reconciliation_settings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    amount_tolerance_percent numeric default 2,
    exact_amount_tolerance numeric default 0.01,
    date_window_business_days integer default 3,
    fx_tolerance_percent numeric default 0.5,
    tier4_confidence_threshold numeric default 0.85,
    stale_threshold_days integer default 7,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(user_id)
);
