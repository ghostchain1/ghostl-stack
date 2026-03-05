import { Interface, isAddress, ZeroAddress, keccak256 } from "ethers";

export type AuditLevel   = "info" | "warn" | "high";
export type AuditFinding = {
  level:    AuditLevel;
  code:     string;
  message:  string;
  meta?:    unknown;
};

export type AuditResult = {
  riskScore:  number;           // 0..1
  findings:   AuditFinding[];
  summary:    string;
};
