import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";
import { createHash, timingSafeEqual } from "crypto";

const app  = express();
const PORT = process.env.PORT ?? 4205;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory biometric store (commitments only — never store raw biometric data) ────────
interface BiometricEnrollment {
  address: string;
  commitment: string; // SHA-256 hash of (address + salt + biometric_hash)
  salt: string;       // hex, stored to allow re-verification
  enrolledAt: number;
  verifyCount: number;
  lastVerifiedAt?: number;
}

const enrollments = new Map<string, BiometricEnrollment>();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-biometric", ts: Date.now() });
});

app.post("/biometric/enroll", (req, res) => {
  const { address, biometricHash } = req.body as { address?: string; biometricHash?: string };
  if (!address || !biometricHash) {
    res.status(400).json({ error: "address and biometricHash are required" }); return;
  }
  if (enrollments.has(address.toLowerCase())) {
    res.status(409).json({ error: "address already enrolled" }); return;
  }
  const salt = createHash("sha256").update(address + Date.now().toString()).digest("hex").slice(0, 32);
  const commitment = createHash("sha256")
    .update(address.toLowerCase() + salt + biometricHash)
    .digest("hex");
  const enrollment: BiometricEnrollment = {
    address: address.toLowerCase(), commitment, salt, enrolledAt: Date.now(), verifyCount: 0,
  };
  enrollments.set(address.toLowerCase(), enrollment);
  log.info("biometric.enrolled", { address });
  // Return commitment + salt; client needs both to verify later
  res.status(201).json({ address: address.toLowerCase(), commitment, salt, enrolledAt: enrollment.enrolledAt });
});

app.post("/biometric/verify", (req, res) => {
  const { address, biometricHash, salt } = req.body as { address?: string; biometricHash?: string; salt?: string };
  if (!address || !biometricHash || !salt) {
    res.status(400).json({ error: "address, biometricHash and salt are required" }); return;
  }
  const enrollment = enrollments.get(address.toLowerCase());
  if (!enrollment) { res.status(404).json({ error: "address not enrolled" }); return; }
  const expected = createHash("sha256")
    .update(address.toLowerCase() + salt + biometricHash)
    .digest("hex");
  const expectedBuf = Buffer.from(expected,           "hex");
  const storedBuf   = Buffer.from(enrollment.commitment, "hex");
  let match = false;
  if (expectedBuf.length === storedBuf.length) {
    match = timingSafeEqual(expectedBuf, storedBuf);
  }
  if (match) {
    enrollment.verifyCount++;
    enrollment.lastVerifiedAt = Date.now();
  }
  log.info("biometric.verify", { address, match });
  res.json({ address: address.toLowerCase(), verified: match });
});

app.get("/biometric/status/:addr", (req, res) => {
  const enrollment = enrollments.get(req.params.addr.toLowerCase());
  if (!enrollment) { res.status(404).json({ enrolled: false }); return; }
  res.json({
    enrolled: true,
    address: enrollment.address,
    enrolledAt: enrollment.enrolledAt,
    verifyCount: enrollment.verifyCount,
    lastVerifiedAt: enrollment.lastVerifiedAt,
  });
});


app.listen(PORT, () => log.info(`gsi-biometric listening :${PORT}`));
export default app;
