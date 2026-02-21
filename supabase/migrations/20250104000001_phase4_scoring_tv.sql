-- Phase 4: Slim Scoring, Court TV & TD Sign-Off
-- Adds scoring_token, pending_signoff status, match events RPC functions,
-- and Realtime publication for live scoring

-- 1. Add scoring_token to tournaments
ALTER TABLE bracket_blaze_tournaments
ADD COLUMN scoring_token UUID;

-- 2. Add pending_signoff to match_status enum
ALTER TYPE bracket_blaze_match_status ADD VALUE 'pending_signoff' AFTER 'on_court';

-- 3. Enable Supabase Realtime on matches table
ALTER PUBLICATION supabase_realtime ADD TABLE bracket_blaze_matches;

-- 4. Index for match_events by match + current game (used by undo_point)
CREATE INDEX idx_bracket_blaze_match_events_match_type
ON bracket_blaze_match_events(match_id, event_type, timestamp DESC);

-- =============================================================================
-- RPC FUNCTIONS (SECURITY DEFINER — bypass RLS, validate token internally)
-- =============================================================================

-- Helper: validate scoring token and return tournament_id
CREATE OR REPLACE FUNCTION bracket_blaze_validate_scoring_token(p_token UUID)
RETURNS UUID AS $$
DECLARE
    v_tournament_id UUID;
BEGIN
    SELECT id INTO v_tournament_id
    FROM bracket_blaze_tournaments
    WHERE scoring_token = p_token
    AND status = 'active';

    IF v_tournament_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired scoring token';
    END IF;

    RETURN v_tournament_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: validate match belongs to tournament and has expected status
CREATE OR REPLACE FUNCTION bracket_blaze_validate_match(
    p_match_id UUID,
    p_tournament_id UUID,
    p_expected_status bracket_blaze_match_status
)
RETURNS bracket_blaze_matches AS $$
DECLARE
    v_match bracket_blaze_matches;
BEGIN
    SELECT m.* INTO v_match
    FROM bracket_blaze_matches m
    JOIN bracket_blaze_divisions d ON d.id = m.division_id
    WHERE m.id = p_match_id
    AND d.tournament_id = p_tournament_id
    FOR UPDATE OF m;

    IF v_match.id IS NULL THEN
        RAISE EXCEPTION 'Match not found in this tournament';
    END IF;

    IF v_match.status != p_expected_status THEN
        RAISE EXCEPTION 'Match status is %, expected %', v_match.status, p_expected_status;
    END IF;

    RETURN v_match;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- score_point: Increment score for side A or B
-- =============================================================================
CREATE OR REPLACE FUNCTION bracket_blaze_score_point(
    p_token UUID,
    p_match_id UUID,
    p_side TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_tournament_id UUID;
    v_match bracket_blaze_matches;
    v_live_score JSONB;
    v_new_score_a INT;
    v_new_score_b INT;
    v_current_game INT;
BEGIN
    -- Validate inputs
    IF p_side NOT IN ('A', 'B') THEN
        RAISE EXCEPTION 'Side must be A or B';
    END IF;

    -- Validate token
    v_tournament_id := bracket_blaze_validate_scoring_token(p_token);

    -- Lock and validate match
    v_match := bracket_blaze_validate_match(p_match_id, v_tournament_id, 'on_court');

    -- Get current live_score from meta_json
    v_live_score := COALESCE(v_match.meta_json->'live_score', '{"current_game": 1, "score_a": 0, "score_b": 0}'::JSONB);
    v_current_game := (v_live_score->>'current_game')::INT;
    v_new_score_a := (v_live_score->>'score_a')::INT;
    v_new_score_b := (v_live_score->>'score_b')::INT;

    -- Increment the correct side
    IF p_side = 'A' THEN
        v_new_score_a := v_new_score_a + 1;
    ELSE
        v_new_score_b := v_new_score_b + 1;
    END IF;

    -- Insert point event
    INSERT INTO bracket_blaze_match_events (match_id, event_type, payload_json)
    VALUES (
        p_match_id,
        'point',
        jsonb_build_object(
            'side', p_side,
            'score_a', v_new_score_a,
            'score_b', v_new_score_b,
            'game', v_current_game
        )
    );

    -- Update live_score in meta_json
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

-- =============================================================================
-- undo_point: Revert the last point in the current game
-- =============================================================================
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

    -- Find the last point event in the current game
    SELECT id, payload_json INTO v_last_event
    FROM bracket_blaze_match_events
    WHERE match_id = p_match_id
    AND event_type = 'point'
    AND (payload_json->>'game')::INT = v_current_game
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

-- =============================================================================
-- end_game: End current game and start next one
-- =============================================================================
CREATE OR REPLACE FUNCTION bracket_blaze_end_game(
    p_token UUID,
    p_match_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_tournament_id UUID;
    v_match bracket_blaze_matches;
    v_live_score JSONB;
    v_current_game INT;
    v_score_a INT;
    v_score_b INT;
    v_games JSONB;
    v_new_live_score JSONB;
BEGIN
    -- Validate token
    v_tournament_id := bracket_blaze_validate_scoring_token(p_token);

    -- Lock and validate match
    v_match := bracket_blaze_validate_match(p_match_id, v_tournament_id, 'on_court');

    -- Get current live_score
    v_live_score := COALESCE(v_match.meta_json->'live_score', '{"current_game": 1, "score_a": 0, "score_b": 0}'::JSONB);
    v_current_game := (v_live_score->>'current_game')::INT;
    v_score_a := (v_live_score->>'score_a')::INT;
    v_score_b := (v_live_score->>'score_b')::INT;

    -- Guard: cannot end a game at 0-0
    IF v_score_a = 0 AND v_score_b = 0 THEN
        RAISE EXCEPTION 'Cannot end a game at 0-0';
    END IF;

    -- Insert game_end event
    INSERT INTO bracket_blaze_match_events (match_id, event_type, payload_json)
    VALUES (
        p_match_id,
        'game_end',
        jsonb_build_object(
            'game', v_current_game,
            'final_score_a', v_score_a,
            'final_score_b', v_score_b
        )
    );

    -- Push current score to games array
    v_games := COALESCE(v_match.meta_json->'games', '[]'::JSONB);
    v_games := v_games || jsonb_build_array(
        jsonb_build_object('score_a', v_score_a, 'score_b', v_score_b)
    );

    -- Reset live_score for next game
    v_new_live_score := jsonb_build_object(
        'current_game', v_current_game + 1,
        'score_a', 0,
        'score_b', 0
    );

    -- Update meta_json with new games array and reset live_score
    UPDATE bracket_blaze_matches
    SET meta_json = jsonb_build_object(
        'games', v_games,
        'live_score', v_new_live_score
    ) || (COALESCE(meta_json, '{}'::JSONB) - 'games' - 'live_score')
    WHERE id = p_match_id;

    -- Return new state
    RETURN jsonb_build_object(
        'match_id', p_match_id,
        'live_score', v_new_live_score,
        'games', v_games
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- submit_match: Referee submits match for TD sign-off
-- =============================================================================
CREATE OR REPLACE FUNCTION bracket_blaze_submit_match(
    p_token UUID,
    p_match_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_tournament_id UUID;
    v_match bracket_blaze_matches;
    v_games JSONB;
BEGIN
    -- Validate token
    v_tournament_id := bracket_blaze_validate_scoring_token(p_token);

    -- Lock and validate match
    v_match := bracket_blaze_validate_match(p_match_id, v_tournament_id, 'on_court');

    -- Get games from meta_json
    v_games := COALESCE(v_match.meta_json->'games', '[]'::JSONB);

    -- Guard: must have at least one completed game
    IF jsonb_array_length(v_games) = 0 THEN
        RAISE EXCEPTION 'Cannot submit match with no completed games';
    END IF;

    -- Insert submit event
    INSERT INTO bracket_blaze_match_events (match_id, event_type, payload_json)
    VALUES (
        p_match_id,
        'submit',
        jsonb_build_object('games', v_games)
    );

    -- Transition to pending_signoff
    UPDATE bracket_blaze_matches
    SET status = 'pending_signoff'
    WHERE id = p_match_id;

    -- Return state
    RETURN jsonb_build_object(
        'match_id', p_match_id,
        'status', 'pending_signoff',
        'games', v_games
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- start_match_from_referee: Referee starts a match (ready → on_court)
-- =============================================================================
CREATE OR REPLACE FUNCTION bracket_blaze_start_match_from_referee(
    p_token UUID,
    p_match_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_tournament_id UUID;
    v_match bracket_blaze_matches;
    v_live_score JSONB;
BEGIN
    -- Validate token
    v_tournament_id := bracket_blaze_validate_scoring_token(p_token);

    -- Lock and validate match (must be in 'ready' status)
    v_match := bracket_blaze_validate_match(p_match_id, v_tournament_id, 'ready');

    -- Initialize live_score
    v_live_score := jsonb_build_object(
        'current_game', 1,
        'score_a', 0,
        'score_b', 0
    );

    -- Transition to on_court with live_score initialized
    UPDATE bracket_blaze_matches
    SET status = 'on_court',
        actual_start_time = NOW(),
        meta_json = jsonb_set(
            COALESCE(meta_json, '{}'::JSONB),
            '{live_score}',
            v_live_score
        )
    WHERE id = p_match_id;

    -- Return state
    RETURN jsonb_build_object(
        'match_id', p_match_id,
        'status', 'on_court',
        'live_score', v_live_score
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Grant EXECUTE on all scoring RPCs to anon role
-- =============================================================================
GRANT EXECUTE ON FUNCTION bracket_blaze_validate_scoring_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION bracket_blaze_score_point(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION bracket_blaze_undo_point(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION bracket_blaze_end_game(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION bracket_blaze_submit_match(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION bracket_blaze_start_match_from_referee(UUID, UUID) TO anon;

-- Also grant to authenticated role (TD may test from browser)
GRANT EXECUTE ON FUNCTION bracket_blaze_validate_scoring_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bracket_blaze_score_point(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION bracket_blaze_undo_point(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bracket_blaze_end_game(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bracket_blaze_submit_match(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bracket_blaze_start_match_from_referee(UUID, UUID) TO authenticated;
