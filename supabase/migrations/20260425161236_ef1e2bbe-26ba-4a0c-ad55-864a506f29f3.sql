CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_event_full_uniq
  ON public.notifications (user_id, event_id);