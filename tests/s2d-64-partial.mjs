// TEST-ONLY adversarial Sync transport. The missing item is withheld for twelve
// complete watchdog cycles, then delivered. Elapsed time must not authorize a
// repair that hides the missing item or invents a deletion.
import { boot, round, settle, ledger, view } from './s2d-claude-two-device.mjs';
const [browser = 'chrome', policy = 'lww'] = process.argv.slice(2);
const env = await boot(browser, policy);
const { relay, A, B } = env;
const key = 'mosaicsync.sync.space.work.item.x-a';
const originalUpload = relay.upload.bind(relay);
let blocked = true;
relay.upload = id => {
  const d = relay.d(id);
  const hold = blocked && id === A.view && d.outbox.has(key);
  if (hold) d.outbox.delete(key);
  originalUpload(id);
  if (hold) d.outbox.add(key);
};
const result = { browser, policy, observations: [] };
try {
  await A.command('mutate', { space: 'work', action: 'add', id: 'x-a' });
  for (let i = 0; i < 12; i++) {
    await round(relay, A);
    await round(relay, B);
    const a = await view(A, 'work');
    const b = await view(B, 'work');
    result.observations.push({ cycle: i, A: a.items, B: b.items, statusB: b.status, cloud: ledger(relay, null, 'work') });
    if (b.items.some(x => x.startsWith('x-a@'))) throw Error('B adopted undelivered item');
    if (!a.items.some(x => x.startsWith('x-a@'))) throw Error('A lost its local item');
    if (relay.server.has(key)) throw Error('held record unexpectedly reached cloud');
  }
  blocked = false;
  await settle(relay, A, B, 8);
  const a = await view(A, 'work');
  const b = await view(B, 'work');
  result.final = { A: a, B: b, cloud: ledger(relay, null, 'work') };
  if (!result.final.cloud.coherent || !b.items.some(x => x.startsWith('x-a@')) ||
      JSON.stringify(a.items) !== JSON.stringify(b.items)) throw Error('did not converge after complete delivery');
  console.log(JSON.stringify({ pass: true, browser, policy, waitingCycles: result.observations.length, final: result.final }));
} finally { env.close(); }
