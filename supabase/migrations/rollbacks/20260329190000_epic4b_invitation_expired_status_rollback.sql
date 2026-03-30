-- ============================================================================
-- ROLLBACK: EPIC 4b — Invitation Expired Status Extension
-- Reverts: 20260329190000_epic4b_invitation_expired_status.sql
--
-- ⚠️ IMPORTANT LIMITATION:
-- PostgreSQL does NOT support removing values from an ENUM type.
-- The 'expired' value will remain in the invitation_status ENUM after rollback.
-- This is harmless — no code references 'expired' after rollback, and the value
-- simply sits unused in the ENUM definition.
--
-- To fully remove the ENUM value, you would need to:
-- 1. Create a new ENUM without the value
-- 2. Alter all columns using the old ENUM to use the new one
-- 3. Drop the old ENUM
-- This is destructive and not recommended for rollback scenarios.
-- ============================================================================

-- No-op rollback: PostgreSQL cannot remove ENUM values
-- The 'expired' value remains in invitation_status but is harmless when unused.
SELECT 'ROLLBACK NOTE: invitation_status ENUM still contains expired value — this is expected and harmless';
