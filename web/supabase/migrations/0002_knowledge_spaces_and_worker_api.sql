create table public.knowledge_spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

alter table public.learning_items add column knowledge_space_id uuid references public.knowledge_spaces(id) on delete set null;
alter table public.reviews add column knowledge_space_id uuid references public.knowledge_spaces(id) on delete set null;
alter table public.sources add column knowledge_space_id uuid references public.knowledge_spaces(id) on delete set null;

alter table public.learning_items drop constraint learning_items_type_check;
alter table public.learning_items add constraint learning_items_type_check check (type in ('fact', 'concept', 'decision', 'quote', 'vocabulary', 'expression', 'error', 'pronunciation'));

create index learning_items_space_due_idx on public.learning_items (user_id, knowledge_space_id, next_due);
alter table public.knowledge_spaces enable row level security;
create policy "users read own knowledge spaces" on public.knowledge_spaces for select using (user_id = auth.uid());
