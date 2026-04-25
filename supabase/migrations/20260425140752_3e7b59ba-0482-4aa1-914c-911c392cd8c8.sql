CREATE TABLE public.preventive_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  machine_id TEXT NOT NULL,
  assignee_account_id TEXT,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  period_days INTEGER NOT NULL DEFAULT 0 CHECK (period_days >= 0 AND period_days <= 7),
  period_weeks INTEGER NOT NULL DEFAULT 0 CHECK (period_weeks >= 0 AND period_weeks <= 4),
  period_months INTEGER NOT NULL DEFAULT 0 CHECK (period_months >= 0 AND period_months <= 12),
  period_years INTEGER NOT NULL DEFAULT 0 CHECK (period_years >= 0 AND period_years <= 10),
  next_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_run_at TIMESTAMP WITH TIME ZONE,
  occurrences_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.preventive_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plans: manager select"
  ON public.preventive_plans FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Plans: manager insert"
  ON public.preventive_plans FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manager') AND created_by = auth.uid());

CREATE POLICY "Plans: manager update"
  ON public.preventive_plans FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Plans: manager delete"
  ON public.preventive_plans FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_preventive_plans_updated_at
  BEFORE UPDATE ON public.preventive_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_preventive_plans_due ON public.preventive_plans (next_run_at) WHERE active = true;