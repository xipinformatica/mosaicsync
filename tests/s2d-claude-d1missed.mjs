// TEST-ONLY: D1 where device A applies B's stale overwrite of the tombstone key WITHOUT receiving
// storage.onChanged (models a missed event / background not running when Sync applied it).
import {boot, round, ledger, view} from './s2d-claude-two-device.mjs';
const [browser='chrome', policy='lww']=process.argv.slice(2);
const env=await boot(browser,policy); const {relay,A,B}=env;
const K='mosaicsync.sync.space.work.item.work-a';
await A.command('mutate',{space:'work',action:'delete',id:'work-a'}); await round(relay,A);
await B.command('mutate',{space:'work',action:'rename',id:'work-a',title:'stale rename'}); relay.upload(B.view);
const missed=relay.download(A.view); // applied to A's storage.sync copy, but NO onChanged dispatched
console.log('A silently received keys:',Object.keys(missed).map(k=>k.replace('mosaicsync.sync.','')).join(', '));
for(let i=0;i<4;i++){ await A.command('alarm',{name:'mosaicsync-sync-watch-v1'}); relay.upload(A.view); await round(relay,B); await round(relay,A); }
const a=await view(A,'work'), b=await view(B,'work');
console.log(JSON.stringify({policy,A:a.items,B:b.items,serverKey:relay.server.get(K)?.kind,cloud:ledger(relay,null,'work')}));
env.close(); process.exit(0);
