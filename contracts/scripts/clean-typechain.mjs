import fs from "fs";
import path from "path";

const target = path.join(process.cwd(), "typechain-types");

try {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`Removed ${target}`);
  } else {
    console.log(`No typechain-types directory at ${target}`);
  }
} catch (error) {
  console.error(`Failed to remove ${target}`);
  console.error(error);
  process.exitCode = 1;
}
