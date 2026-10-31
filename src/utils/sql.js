// Small, safe SQL helpers. Column names come ONLY from zod-validated / hard-coded keys
// (never raw user input), and are additionally checked against a strict pattern.
const TABLES = new Set(['organizations', 'users', 'tournaments', 'teams', 'players', 'matches']);

const snake = (s) => {
  if (!/^[a-zA-Z]+$/.test(s)) throw new Error(`Unsafe column key: ${s}`);
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
};
const assertTable = (t) => {
  if (!TABLES.has(t)) throw new Error(`Unknown table: ${t}`);
};
const definedKeys = (data) => Object.keys(data).filter((k) => data[k] !== undefined);

async function insertRow(runner, table, data) {
  assertTable(table);
  const keys = definedKeys(data);
  const text = `INSERT INTO ${table} (${keys.map(snake).join(', ')})
                VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
  const { rows } = await runner.query(text, keys.map((k) => data[k]));
  return rows[0];
}

async function updateRow(runner, table, id, data) {
  assertTable(table);
  const keys = definedKeys(data);
  if (!keys.length) {
    const { rows } = await runner.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return rows[0];
  }
  const sets = keys.map((k, i) => `${snake(k)} = $${i + 1}`).join(', ');
  const { rows } = await runner.query(
    `UPDATE ${table} SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => data[k]), id]
  );
  return rows[0];
}

// Builds a parameterised WHERE clause: where.add('status = $#', 'live')
class Where {
  constructor() {
    this.conds = [];
    this.params = [];
  }
  add(sql, value) {
    this.params.push(value);
    this.conds.push(sql.replace(/\$#/g, `$${this.params.length}`));
    return this;
  }
  get sql() {
    return this.conds.length ? `WHERE ${this.conds.join(' AND ')}` : '';
  }
}

module.exports = { insertRow, updateRow, Where };
