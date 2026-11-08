import { projectWallet } from '../src/economy/points.ts';

export async function confirmedWallet(sql, profile, records) {
  const values = [...records.values()];
  const listings = values.filter(r => r.entity === 'listings').map(r => r.data);
  const requests = values.filter(r => r.entity === 'requests').map(r => r.data);
  const wallet = projectWallet(profile.id, listings, requests, profile.protectionSince, profile.walletReinstatedAt);
  for (const entry of wallet.entries) {
    await sql('INSERT INTO points_ledger(member_id,event_id,amount,label,recorded_at,listing_id) VALUES(?,?,?,?,?,?) ON CONFLICT(member_id,event_id) DO NOTHING',
      [profile.id,entry.id,entry.delta,entry.label,entry.at,entry.listingId ?? null]);
  }
  const rows = await sql('SELECT event_id,amount,label,recorded_at,listing_id FROM points_ledger WHERE member_id=? ORDER BY recorded_at DESC,event_id',[profile.id]);
  const entries = rows.map(row => ({id:row.event_id,delta:row.amount,label:row.label,at:row.recorded_at,listingId:row.listing_id || undefined}));
  const balance = entries.reduce((sum, entry) => sum + entry.delta, 0);
  return {...wallet, entries, balance, available:balance-wallet.held};
}
