const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Circle-method round robin. Returns an array of rounds; each round is [[home, away], ...]
function roundRobin(teamIds, doubleRound = false) {
  const teams = [...teamIds];
  if (teams.length % 2 === 1) teams.push(null); // null = rest day for odd team counts
  const n = teams.length;
  const half = n / 2;
  const schedule = [];
  let arr = [...teams];

  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a && b) pairs.push(r % 2 === 0 ? [a, b] : [b, a]); // alternate home/away
    }
    schedule.push(pairs);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  if (doubleRound) {
    const reverse = schedule.map((pairs) => pairs.map(([a, b]) => [b, a]));
    return [...schedule, ...reverse];
  }
  return schedule;
}

// Single-elimination pairs. Pads to next power of two; first teams receive byes.
function knockoutPairs(teamIds, shuffle = true) {
  const teams = shuffle ? shuffleArray(teamIds) : [...teamIds];
  let size = 1;
  while (size < teams.length) size *= 2;
  const byes = size - teams.length;

  const pairs = teams.slice(0, byes).map((t) => [t, null]);
  const rest = teams.slice(byes);
  for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
  return pairs;
}

function roundLabel(teamsInRound) {
  if (teamsInRound === 2) return 'Final';
  if (teamsInRound === 4) return 'Semi-final';
  if (teamsInRound === 8) return 'Quarter-final';
  return `Round of ${teamsInRound}`;
}

module.exports = { roundRobin, knockoutPairs, roundLabel, shuffleArray };
