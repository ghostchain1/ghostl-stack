const min = [22, 21, 0];
const maxMajorExclusive = 23;
const actual = process.version;

const parse = (v) => {
  const match = String(v).trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const gte = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
};

console.log(actual);

const actualParts = parse(actual);
if (!actualParts) {
  console.error(`Unable to parse Node.js version: ${actual}`);
  process.exit(1);
}

if (actualParts[0] >= maxMajorExclusive || !gte(actualParts, min)) {
  console.error(`Expected Node.js >=v${min.join('.')} <v${maxMajorExclusive}.0.0 but found ${actual}.`);
  process.exit(1);
}
