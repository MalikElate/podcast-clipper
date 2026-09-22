import { DurableObject } from 'cloudflare:workers';
// Single global counter caps optional inference at 100 requests per UTC day.
// Stores only a date and count; no handles, captions, IPs, or account data.
export class RoastBudget extends DurableObject {
  async take() {
    return this.ctx.storage.transaction(async storage => {
      const day = new Date().toISOString().slice(0,10);
      const previous = await storage.get('budget');
      const count = previous?.day === day ? previous.count : 0;
      if (count >= 100) return false;
      await storage.put('budget',{day,count:count+1});
      return true;
    });
  }
}
