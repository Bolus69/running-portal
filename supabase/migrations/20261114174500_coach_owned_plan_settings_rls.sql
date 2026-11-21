-- Plan settings are written only by the authenticated server route, which verifies coach role and assignment.
-- Keep athlete read access, but remove direct Data API writes for both athletes and coaches.
drop policy if exists "Athlete creates own plan or coach creates assigned plan" on public.training_plans;
drop policy if exists "Athlete and assigned coach can update plans" on public.training_plans;
