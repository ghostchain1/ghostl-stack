import { query } from '../db';
import { extractKeywords } from '../ai/features';

const topicActionMap: Record<string, string[]> = {
  aml: ['TRANSFER', 'BRIDGE', 'SWAP'],
  sanctions: ['TRANSFER', 'BRIDGE'],
  kyc: ['WALLET_CREATE', 'TRANSFER', 'SWAP']
};

export async function runPredictions(): Promise<void> {
  const laws = await query<{
    jurisdiction_code: string;
    topic: string;
    title: string;
    text: string;
    effective_from: string;
  }>(
    `SELECT l.jurisdiction_code, l.topic, l.title, v.text, v.effective_from
     FROM laws l
     JOIN law_versions v ON v.law_id = l.id
     ORDER BY v.effective_from DESC`
  );

  const rules = await query<{ actions: string[]; effect: string }>(
    'SELECT actions, effect FROM policy_rules'
  );
  const actionSet = new Set(rules.flatMap((r) => r.actions));

  const denyCounts = await query<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM compliance_decisions WHERE decision = 'deny' AND created_at > now() - interval '24 hours'`
  );
  const denyRate = (denyCounts[0]?.count || 0) / 100;

  for (const law of laws) {
    const keywords = extractKeywords(law.text);
    const mappedActions = topicActionMap[law.topic] || [];
    const coverageScore = mappedActions.length
      ? mappedActions.filter((action) => actionSet.has(action)).length / mappedActions.length
      : 0;

    const daysToEffective = Math.max(0, Math.ceil((new Date(law.effective_from).getTime() - Date.now()) / 86400000));
    const urgency = daysToEffective === 0 ? 1 : Math.max(0, 1 - daysToEffective / 30);
    const gapRisk = coverageScore < 0.5 ? 0.4 : 0;
    const riskDelta = Math.min(1, urgency + gapRisk + denyRate);

    const summaryParts = [
      `Law update "${law.title}" impacts ${law.topic.toUpperCase()}.`,
      coverageScore < 0.5 ? 'Policy coverage appears thin for mapped actions.' : 'Policy coverage appears sufficient.',
      daysToEffective > 0 ? `Effective in ${daysToEffective} days.` : 'Effective now.'
    ];

    await query('DELETE FROM compliance_predictions WHERE jurisdiction = $1 AND topic = $2', [
      law.jurisdiction_code,
      law.topic
    ]);

    await query(
      `INSERT INTO compliance_predictions (jurisdiction, topic, risk_delta, summary, features)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        law.jurisdiction_code,
        law.topic,
        Number(riskDelta.toFixed(2)),
        summaryParts.join(' '),
        {
          keywords,
          mappedActions,
          coverageScore,
          urgency,
          denyRate
        }
      ]
    );
  }
}
