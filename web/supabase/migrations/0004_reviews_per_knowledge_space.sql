alter table public.reviews
  drop constraint if exists reviews_user_id_review_date_key;

alter table public.reviews
  add constraint reviews_user_space_date_key
  unique (user_id, knowledge_space_id, review_date);
