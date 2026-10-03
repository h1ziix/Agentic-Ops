-- A terminal DNS root dot is valid public evidence (for example https://rekassa.kz.).
-- Match the server's URL validation without weakening private-host or IP exclusions.
create or replace function public.research_domain(p_url text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(lower(split_part(split_part(split_part(regexp_replace(p_url, '^https?://', '', 'i'), '/', 1), '?', 1), '#', 1)), '^www\.', ''), '\.$', '');
$$;

create or replace function public.public_research_url(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_url ~ '^https?://[A-Za-z0-9.-]+\.[A-Za-z0-9-]+\.?([/?#][^[:space:]]*)?$'
    and char_length(p_url) <= 2048 and public.research_domain(p_url) !~ '^[0-9.]+$'
    and public.research_domain(p_url) !~ '(^|\.)(localhost|local|internal|test|invalid|localdomain|home|lan)$', false);
$$;
