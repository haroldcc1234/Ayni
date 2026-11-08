import { sharedMode } from '../sync/mode';
import { boardCommand } from './territory';
import { db } from '../db/db';
import { authorize, logDecision, readRecord, sectorOf, writeRecord } from './territory';

export interface CampaignEntry { id: string; actor: string; units: number; at: string }
export interface Campaign {
  id: string; title: string; unit: string; target: number; sectorId: string;
  entries: CampaignEntry[]; closedBy?: string; closedAt?: string;
}

function quantity(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 1_000_000) throw new Error('Ingresa una cantidad entera de 1 a 1 000 000.');
}

export async function startCampaign(actorId: string, title: string, unit: string, target: number) {
  if(sharedMode)return boardCommand({type:'campaign',title,unit,target});
  quantity(target);
  if (title.trim().length < 4 || !unit.trim()) throw new Error('Indica un nombre y la unidad que se contará.');
  await db.transaction('rw', db.profiles, db.settings, async () => {
    const actor = await authorize(actorId, ['tesorero', 'presidente']);
    const sectorId = sectorOf(actor).id;
    const id = crypto.randomUUID();
    await writeRecord(`campaign/${sectorId}/${id}`, {
      id, sectorId, title: title.trim().slice(0, 120), unit: unit.trim().slice(0, 32), target, entries: [],
    } satisfies Campaign);
    await logDecision(actor, 'Campaña abierta · ' + title.trim());
  });
}

export async function recordCampaignAction(actorId: string, campaignId: string, units?: number, entryId = crypto.randomUUID()) {
  if(sharedMode)return boardCommand({type:units===undefined?'closeCampaign':'contribute',units,campaignId,commandId:entryId});
  await db.transaction('rw', db.profiles, db.settings, async () => {
    const actor = await authorize(actorId, units === undefined ? ['tesorero', 'presidente'] : ['vecino', 'tesorero', 'vocal', 'presidente']);
    const key = `campaign/${sectorOf(actor).id}/${campaignId}`;
    const campaign = await readRecord<Campaign>(key);
    if (!campaign || campaign.closedAt) throw new Error('La campaña está cerrada o ya no está disponible.');
    const at = new Date().toISOString();
    if (units !== undefined) {
      quantity(units);
      if (campaign.entries.some(item => item.id === entryId)) return;
      campaign.entries.push({ id: entryId, actor: actor.name, at, units });
      await logDecision(actor, `Aporte declarado · ${units} ${campaign.unit} · ${campaign.title}`);
    } else {
      campaign.closedAt = at;
      campaign.closedBy = actor.name;
      await logDecision(actor, 'Recuento validado y cerrado · ' + campaign.title);
    }
    await writeRecord(key, campaign);
  });
}
