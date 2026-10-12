import {execFileSync} from 'node:child_process';
// One memory database per process keeps verification bounded on local machines.
for(const name of ['private two-sided','completion eligibility','tax and non-claim'])execFileSync(process.execPath,['--liftoff-only','--no-wasm-tier-up','--test','--test-name-pattern='+name,'tests/meeting-feedback.test.mjs'],{stdio:'inherit'});
