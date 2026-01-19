const expected = 'v22.21.0';
const actual = process.version;

console.log(actual);

if (actual !== expected) {
  console.error(`Expected Node.js ${expected} but found ${actual}.`);
  process.exit(1);
}
