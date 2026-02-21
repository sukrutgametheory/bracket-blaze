-- Fix: undo_point was finding the same point event repeatedly because
-- reverted point events were never excluded from the "last point" query.
-- Now excludes points that already have a corresponding undo event.

CREATE OR REPLACE FUNCTION bracket_blaze_undo_point(
    p_token UUID,
    p_match_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_tournament_id UUID;
    v_match bracket_blaze_matches;
    v_last_event RECORD;
    v_live_score JSONB;
    v_new_score_a INT;
    v_new_score_b INT;
    v_current_game INT;
BEGIN
    -- Validate token
    v_tournament_id := bracket_blaze_validate_scoring_token(p_token);

    -- Lock and validate match
    v_match := bracket_blaze_validate_match(p_match_id, v_tournament_id, 'on_court');

    -- Get current game number
    v_live_score := COALESCE(v_match.meta_json->'live_score', '{"current_game": 1, "score_a": 0, "score_b": 0}'::JSONB);
    v_current_game := (v_live_score->>'current_game')::INT;

    -- Find the last point event in the current game that hasn't been undone
    SELECT id, payload_json INTO v_last_event
    FROM bracket_blaze_match_events
    WHERE match_id = p_match_id
    AND event_type = 'point'
    AND (payload_json->>'game')::INT = v_current_game
    AND id NOT IN (
        SELECT (payload_json->>'reverted_event_id')::UUID
        FROM bracket_blaze_match_events
        WHERE match_id = p_match_id
        AND event_type = 'undo'
    )
    ORDER BY timestamp DESC
    LIMIT 1;

    IF v_last_event.id IS NULL THEN
        RAISE EXCEPTION 'No points to undo in current game';
    END IF;

    -- Calculate new scores by decrementing the side that scored
    v_new_score_a := (v_live_score->>'score_a')::INT;
    v_new_score_b := (v_live_score->>'score_b')::INT;

    IF (v_last_event.payload_json->>'side') = 'A' THEN
        v_new_score_a := GREATEST(0, v_new_score_a - 1);
    ELSE
        v_new_score_b := GREATEST(0, v_new_score_b - 1);
    END IF;

    -- Insert undo event
    INSERT INTO bracket_blaze_match_events (match_id, event_type, payload_json)
    VALUES (
        p_match_id,
        'undo',
        jsonb_build_object('reverted_event_id', v_last_event.id)
    );

    -- Update live_score
    v_live_score := jsonb_build_object(
        'current_game', v_current_game,
        'score_a', v_new_score_a,
        'score_b', v_new_score_b
    );

    UPDATE bracket_blaze_matches
    SET meta_json = jsonb_set(
        COALESCE(meta_json, '{}'::JSONB),
        '{live_score}',
        v_live_score
    )
    WHERE id = p_match_id;

    -- Return new state
    RETURN jsonb_build_object(
        'match_id', p_match_id,
        'live_score', v_live_score,
        'games', COALESCE(v_match.meta_json->'games', '[]'::JSONB)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
