import { NextRequest, NextResponse } from 'next/server';

export type KycSubmission = {
  id: string;
  address: string;
  name: string;
  country: string;
  docType: string;
  submitted: string;
  status: 'pending' | 'under-review' | 'approved' | 'rejected' | 'escalated';
  risk: 'low' | 'medium' | 'high';
  note: string;
  reviewer: string | null;
};

const SUBMISSIONS: KycSubmission[] = [
  { id: 'KYC-0482', address: '0x7cD4…F298', name: 'J. Müller',      country: 'DE', docType: 'Passport',     submitted: '2026-03-01T09:15:00Z', status: 'under-review', risk: 'low',    note: 'ID image quality borderline',      reviewer: 'kyc-agent-1' },
  { id: 'KYC-0481', address: '0x3aB1…C7E9', name: 'A. Okonkwo',     country: 'NG', docType: 'Natl ID',      submitted: '2026-03-01T07:50:00Z', status: 'pending',      risk: 'medium', note: '',                                 reviewer: null },
  { id: 'KYC-0480', address: '0xD5e6…23A1', name: 'L. Santamaría',  country: 'MX', docType: 'Passport',     submitted: '2026-02-28T22:00:00Z', status: 'pending',      risk: 'low',    note: '',                                 reviewer: null },
  { id: 'KYC-0479', address: '0xF2a3…B4C5', name: 'K. Nakamura',    country: 'JP', docType: "Driver's Lic", submitted: '2026-02-28T18:40:00Z', status: 'escalated',    risk: 'high',   note: 'Sanctions list partial match (99%)',reviewer: 'compliance-1' },
  { id: 'KYC-0478', address: '0x9E8f…1B2C', name: 'T. Singh',       country: 'IN', docType: 'Passport',     submitted: '2026-02-28T14:00:00Z', status: 'approved',     risk: 'low',    note: '',                                 reviewer: 'kyc-agent-2' },
  { id: 'KYC-0477', address: '0x1A2b…F3G4', name: 'M. Petrova',     country: 'BG', docType: 'Natl ID',      submitted: '2026-02-28T11:30:00Z', status: 'rejected',     risk: 'medium', note: 'Document expired (2024-11-01)',     reviewer: 'kyc-agent-1' },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const risk   = searchParams.get('risk');

  let data = SUBMISSIONS;
  if (status) data = data.filter(s => s.status === status);
  if (risk)   data = data.filter(s => s.risk === risk);

  return NextResponse.json({
    submissions: data,
    total: data.length,
    stats: {
      pending:      SUBMISSIONS.filter(s => s.status === 'pending').length,
      under_review: SUBMISSIONS.filter(s => s.status === 'under-review').length,
      escalated:    SUBMISSIONS.filter(s => s.status === 'escalated').length,
      approved:     SUBMISSIONS.filter(s => s.status === 'approved').length,
      rejected:     SUBMISSIONS.filter(s => s.status === 'rejected').length,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, action, reviewer } = body as { id?: string; action?: 'approve' | 'reject' | 'escalate'; reviewer?: string };
  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 });

  const STATUS_MAP: Record<string, KycSubmission['status']> = {
    approve:  'approved',
    reject:   'rejected',
    escalate: 'escalated',
  };

  return NextResponse.json({ ok: true, id, status: STATUS_MAP[action], reviewer: reviewer ?? null });
}
