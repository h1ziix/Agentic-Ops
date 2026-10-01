-- Enum additions commit before their first use.
alter type public.agent_event_type add value if not exists 'integration_connected';
alter type public.agent_event_type add value if not exists 'integration_disconnected';
alter type public.agent_event_type add value if not exists 'integration_reconnect_required';
alter type public.agent_event_type add value if not exists 'recipient_confirmed';
alter type public.agent_event_type add value if not exists 'proposal_superseded';
alter type public.agent_event_type add value if not exists 'execution_claimed';
alter type public.agent_event_type add value if not exists 'execution_succeeded';
alter type public.agent_event_type add value if not exists 'execution_outcome_unknown';
alter type public.agent_event_type add value if not exists 'execution_reconciled';
alter type public.agent_event_type add value if not exists 'execution_retry_requested';
alter type public.agent_event_type add value if not exists 'follow_up_planned';
alter type public.agent_event_type add value if not exists 'follow_up_cancelled';
