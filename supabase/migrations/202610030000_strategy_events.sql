-- Commit enum additions before strategy functions can emit them.
alter type public.agent_event_type add value if not exists 'icp_created';
alter type public.agent_event_type add value if not exists 'icp_updated';
alter type public.agent_event_type add value if not exists 'icp_duplicated';
alter type public.agent_event_type add value if not exists 'icp_archived';
alter type public.agent_event_type add value if not exists 'template_created';
alter type public.agent_event_type add value if not exists 'template_updated';
alter type public.agent_event_type add value if not exists 'template_duplicated';
alter type public.agent_event_type add value if not exists 'template_archived';
alter type public.agent_event_type add value if not exists 'workflow_created_from_icp';
alter type public.agent_event_type add value if not exists 'workflow_created_from_template';
