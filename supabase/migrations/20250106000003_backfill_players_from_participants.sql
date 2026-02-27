-- Backfill global player records from existing tournament participants
-- Only processes participants that have a phone number set

-- Step 1: SQL phone normalization function (mirrors TypeScript normalizePhone())
CREATE OR REPLACE FUNCTION bracket_blaze_normalize_phone_e164(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    digits TEXT;
BEGIN
    IF raw IS NULL OR TRIM(raw) = '' THEN
        RETURN NULL;
    END IF;

    -- Strip all non-digit characters
    digits := regexp_replace(raw, '[^0-9]', '', 'g');

    -- Strip leading 0 (Indian convention: 09876543210 → 9876543210)
    IF digits LIKE '0%' THEN
        digits := substring(digits from 2);
    END IF;

    -- 10 digits: assume Indian number, prepend +91
    IF length(digits) = 10 THEN
        RETURN '+91' || digits;
    END IF;

    -- 12 digits starting with 91: add + prefix
    IF length(digits) = 12 AND digits LIKE '91%' THEN
        RETURN '+' || digits;
    END IF;

    -- Otherwise: prepend + and hope for the best
    RETURN '+' || digits;
END;
$$;

-- Step 2: Create global player records from participants with phone numbers
-- Uses ON CONFLICT DO NOTHING so backfill never overwrites existing global records
-- For participants sharing the same normalized phone, takes the first one's details
INSERT INTO bracket_blaze_players (phone, display_name, email, club)
SELECT DISTINCT ON (normalized_phone)
    normalized_phone AS phone,
    p.display_name,
    p.email,
    p.club
FROM (
    SELECT
        id,
        display_name,
        email,
        club,
        bracket_blaze_normalize_phone_e164(phone) AS normalized_phone
    FROM bracket_blaze_participants
    WHERE phone IS NOT NULL AND TRIM(phone) != ''
) p
WHERE p.normalized_phone IS NOT NULL
ORDER BY normalized_phone, p.id  -- deterministic: oldest participant wins
ON CONFLICT (phone) DO NOTHING;

-- Step 3: Link participants to their global player records
UPDATE bracket_blaze_participants AS p
SET player_id = pl.id
FROM bracket_blaze_players AS pl
WHERE p.phone IS NOT NULL
  AND TRIM(p.phone) != ''
  AND pl.phone = bracket_blaze_normalize_phone_e164(p.phone)
  AND p.player_id IS NULL;

-- Step 4: Also normalize the phone on participants that were linked
-- (so the stored phone matches E.164 going forward)
UPDATE bracket_blaze_participants
SET phone = bracket_blaze_normalize_phone_e164(phone)
WHERE phone IS NOT NULL
  AND TRIM(phone) != ''
  AND player_id IS NOT NULL;
