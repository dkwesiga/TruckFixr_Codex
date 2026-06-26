-- Diagnostics session persistence expansion for UI state machine and issue payloads.
alter table if exists public.diagnostic_sessions
  add column if not exists ui_state text not null default 'idle',
  add column if not exists issue_input jsonb not null default '{}'::jsonb,
  add column if not exists clarifications jsonb not null default '[]'::jsonb,
  add column if not exists result jsonb,
  add column if not exists confidence_score numeric,
  add column if not exists risk_level text,
  add column if not exists current_clarifying_question text,
  add column if not exists last_transition_at timestamptz not null default now();

alter table if exists public.diagnostic_sessions
  add constraint diagnostic_sessions_ui_state_check
  check (ui_state in ('idle', 'analyzing', 'clarifying_question', 'processing_answer', 'final_result'));

create index if not exists diagnostic_sessions_vehicle_state_idx
  on public.diagnostic_sessions (vehicle_id, ui_state, created_at desc);
