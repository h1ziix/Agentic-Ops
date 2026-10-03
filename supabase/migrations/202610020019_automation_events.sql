-- Enum additions commit before the checked operations use the new values.
alter type public.agent_event_type add value if not exists 'automation_scheduled';
alter type public.agent_event_type add value if not exists 'automation_started';
alter type public.agent_event_type add value if not exists 'automation_completed';
alter type public.agent_event_type add value if not exists 'automation_failed';
alter type public.agent_event_type add value if not exists 'automation_cancelled';
alter type public.agent_event_type add value if not exists 'retry_scheduled';
alter type public.agent_event_type add value if not exists 'retry_exhausted';
alter type public.agent_event_type add value if not exists 'manual_retry_requested';
alter type public.agent_event_type add value if not exists 'followup_due';
alter type public.agent_event_type add value if not exists 'followup_draft_created';
alter type public.agent_event_type add value if not exists 'reply_check_started';
alter type public.agent_event_type add value if not exists 'reply_detected';
alter type public.agent_event_type add value if not exists 'run_recovered';
alter type public.agent_event_type add value if not exists 'run_marked_stale';
