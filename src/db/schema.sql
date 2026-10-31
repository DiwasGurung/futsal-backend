-- ============================================================================
-- Futsal Tournament SaaS - PostgreSQL schema (Neon compatible, re-runnable)
-- Paste this whole file into: Neon Console -> SQL Editor -> Run
-- ============================================================================

-- ---------- helper: auto-update updated_at ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- organizations (tenants) ----------
CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  logo_url      TEXT,
  contact_email TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- users (staff accounts) ----------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'scorekeeper' CHECK (role IN ('owner','admin','scorekeeper')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- ---------- tournaments ----------
CREATE TABLE IF NOT EXISTS tournaments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  description           TEXT,
  format                TEXT NOT NULL DEFAULT 'league' CHECK (format IN ('league','knockout')),
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','registration','ongoing','completed')),
  start_date            TIMESTAMPTZ,
  end_date              TIMESTAMPTZ,
  venue                 TEXT,
  points_win            INT NOT NULL DEFAULT 3,
  points_draw           INT NOT NULL DEFAULT 1,
  points_loss           INT NOT NULL DEFAULT 0,
  half_duration_minutes INT NOT NULL DEFAULT 20,           -- futsal: 2 x 20 min
  fixtures_generated    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_tournaments_org ON tournaments(organization_id);

-- ---------- teams ----------
CREATE TABLE IF NOT EXISTS teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  short_name      TEXT,
  logo_url        TEXT,
  manager_name    TEXT,
  manager_phone   TEXT,
  manager_email   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, name)
);
CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(organization_id);

-- ---------- players ----------
CREATE TABLE IF NOT EXISTS players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  jersey_number   INT NOT NULL CHECK (jersey_number BETWEEN 0 AND 99),
  position        TEXT CHECK (position IN ('goalkeeper','fixo','ala','pivot')),  -- futsal positions
  date_of_birth   DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, jersey_number)
);
CREATE INDEX IF NOT EXISTS idx_players_org ON players(organization_id);

-- ---------- matches ----------
CREATE TABLE IF NOT EXISTS matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             BIGINT GENERATED ALWAYS AS IDENTITY,      -- stable insertion order (bracket order)
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round           INT NOT NULL,
  round_name      TEXT,
  home_team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id    UUID REFERENCES teams(id) ON DELETE CASCADE,
  scheduled_at    TIMESTAMPTZ,
  court           TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','live','finished','postponed','cancelled')),
  home_score      INT NOT NULL DEFAULT 0,
  away_score      INT NOT NULL DEFAULT 0,
  penalty_home    INT,                                      -- knockout shootout only
  penalty_away    INT,
  winner_id       UUID REFERENCES teams(id) ON DELETE SET NULL,
  is_bye          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (is_bye OR away_team_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_round ON matches(tournament_id, round);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_status ON matches(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_org_date ON matches(organization_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_matches_home ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away ON matches(away_team_id);

-- ---------- match events (goals, cards) ----------
CREATE TABLE IF NOT EXISTS match_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('goal','own_goal','yellow_card','red_card')),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id  UUID REFERENCES players(id) ON DELETE SET NULL,
  minute     INT NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_events_player ON match_events(player_id);

-- ---------- updated_at triggers ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','users','tournaments','teams','players','matches'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- ---------- league standings view (points rules come from the tournament) ----------
CREATE OR REPLACE VIEW tournament_standings AS
WITH results AS (
  SELECT home_team_id AS team_id, home_score AS gf, away_score AS ga
    FROM matches WHERE status = 'finished' AND NOT is_bye
  UNION ALL
  SELECT away_team_id, away_score, home_score
    FROM matches WHERE status = 'finished' AND NOT is_bye
)
SELECT s.*,
       ROW_NUMBER() OVER (
         PARTITION BY s.tournament_id
         ORDER BY s.points DESC, s.goal_difference DESC, s.goals_for DESC, s.name ASC
       )::int AS position
FROM (
  SELECT tm.tournament_id, tm.id AS team_id, tm.name, tm.short_name, tm.logo_url,
         COUNT(r.team_id)::int                                        AS played,
         (COUNT(*) FILTER (WHERE r.gf > r.ga))::int                   AS won,
         (COUNT(*) FILTER (WHERE r.gf = r.ga))::int                   AS drawn,
         (COUNT(*) FILTER (WHERE r.gf < r.ga))::int                   AS lost,
         COALESCE(SUM(r.gf), 0)::int                                  AS goals_for,
         COALESCE(SUM(r.ga), 0)::int                                  AS goals_against,
         (COALESCE(SUM(r.gf), 0) - COALESCE(SUM(r.ga), 0))::int       AS goal_difference,
         ( COUNT(*) FILTER (WHERE r.gf > r.ga) * tr.points_win
         + COUNT(*) FILTER (WHERE r.gf = r.ga) * tr.points_draw
         + COUNT(*) FILTER (WHERE r.gf < r.ga) * tr.points_loss )::int AS points
  FROM teams tm
  JOIN tournaments tr ON tr.id = tm.tournament_id
  LEFT JOIN results r ON r.team_id = tm.id
  GROUP BY tm.id, tr.points_win, tr.points_draw, tr.points_loss
) s;
