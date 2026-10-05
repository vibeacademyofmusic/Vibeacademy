-- Forward-only repair. 20261003143000 was already recorded on upgraded
-- databases before its revoke line existed, and CREATE OR REPLACE keeps the
-- default public execute grant. This function is only called by other
-- security-definer functions, so direct execution is not part of the contract.
revoke all on function public.tuition_renewal_authorized(uuid) from public, anon, authenticated;
