function computeStandings(teams, matches, rules = {}) {
  const { pointsWin = 3, pointsDraw = 1, pointsLoss = 0 } = rules;
  const table = new Map();

  teams.forEach((t) =>
    table.set(String(t._id), {
      team: { id: t._id, name: t.name, shortName: t.shortName, logoUrl: t.logoUrl },
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    })
  );

  for (const m of matches) {
    if (m.status !== 'finished' || m.isBye) continue;
    const h = table.get(String(m.homeTeam));
    const a = table.get(String(m.awayTeam));
    if (!h || !a) continue;

    h.played++; a.played++;
    h.goalsFor += m.homeScore; h.goalsAgainst += m.awayScore;
    a.goalsFor += m.awayScore; a.goalsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) {
      h.won++; a.lost++; h.points += pointsWin; a.points += pointsLoss;
    } else if (m.homeScore < m.awayScore) {
      a.won++; h.lost++; a.points += pointsWin; h.points += pointsLoss;
    } else {
      h.drawn++; a.drawn++; h.points += pointsDraw; a.points += pointsDraw;
    }
  }

  const rows = [...table.values()].map((r) => ({ ...r, goalDifference: r.goalsFor - r.goalsAgainst }));
  rows.sort(
    (x, y) =>
      y.points - x.points ||
      y.goalDifference - x.goalDifference ||
      y.goalsFor - x.goalsFor ||
      x.team.name.localeCompare(y.team.name)
  );
  return rows.map((r, i) => ({ position: i + 1, ...r }));
}

module.exports = { computeStandings };
