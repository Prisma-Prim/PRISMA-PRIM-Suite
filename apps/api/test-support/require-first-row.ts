export function requireFirstRow<Row>(rows: readonly Row[]): Row {
  const [row] = rows;
  if (row === undefined)
    throw new Error('Expected a database row in the fixture.');
  return row;
}
