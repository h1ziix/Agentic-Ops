-- Enum additions must commit before the following migration uses these values.
alter type public.agent_event_type add value if not exists 'workflow_planning_started';
alter type public.agent_event_type add value if not exists 'model_request_started';
alter type public.agent_event_type add value if not exists 'plan_generated';
alter type public.agent_event_type add value if not exists 'plan_validation_failed';
alter type public.agent_event_type add value if not exists 'task_created';
