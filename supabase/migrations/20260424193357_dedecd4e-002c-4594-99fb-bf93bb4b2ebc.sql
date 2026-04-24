-- team_seed is internal; only the SECURITY DEFINER trigger reads it.
-- Add an explicit no-access policy so the linter is satisfied.
CREATE POLICY "team_seed: no client access"
  ON public.team_seed
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);