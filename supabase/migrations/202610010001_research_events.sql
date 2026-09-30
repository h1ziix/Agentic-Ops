-- Enum additions are committed before functions use the new event values.
alter type public.agent_event_type add value if not exists 'research_started';
alter type public.agent_event_type add value if not exists 'company_research_started';
alter type public.agent_event_type add value if not exists 'company_research_failed';
alter type public.agent_event_type add value if not exists 'lead_qualified';
alter type public.agent_event_type add value if not exists 'lead_rejected';
