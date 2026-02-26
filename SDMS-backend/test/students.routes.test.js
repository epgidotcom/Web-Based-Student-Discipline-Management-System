import test from 'node:test';
import assert from 'node:assert/strict';

test('students router declares static routes before parameterized routes', async () => {
  process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/sdms_test';
  const { default: router } = await import('../src/routes/students.js');

  const paths = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  const firstParamPathIndex = paths.findIndex((path) => path.includes(':'));
  assert.notEqual(firstParamPathIndex, -1);

  const staticPathsAfterParams = paths
    .slice(firstParamPathIndex)
    .filter((path) => !path.includes(':'));

  assert.equal(staticPathsAfterParams.length, 0);
});
