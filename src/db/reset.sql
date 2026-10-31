-- DANGER: drops everything. Run in the Neon SQL Editor only if you want a clean slate.
DROP VIEW IF EXISTS tournament_standings;
DROP TABLE IF EXISTS match_events, matches, players, teams, tournaments, users, organizations CASCADE;
DROP FUNCTION IF EXISTS set_updated_at();
