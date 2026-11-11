#!/usr/bin/env node
// ULC Autodev: supervised local runner, ChatGPT-authenticated Codex, no API key.
// The runner never merges, deploys, changes schemas or touches provider credentials.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile, open } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPOSITORY, LABELS, isAuthorizedIssue, checkChangedPaths, branchName, buildPrompt,
} from './ulc-autodev-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.resolve(process.env.LOCALAPPDATA || path.join(homedir(), '.local', 'state'), 'ULC-Autodev');
const args = new Set(process.argv.slice(2));
const loopMode = args.has('--loop');
const dryRun = args.has('--dry-run');
const issueArg = [...args].find((arg) => arg.startsWith('--issue='));
const issueNumber = issueArg ? Number(issueArg.split('=')[1]) : null;
const intervalMinutes = 15;
const MAX_CODEX_REPAIRS = 2;
const RUN_TIMEOUT = 75 * 60_000;
const CI_TIMEOUT = 45 * 60_000;
const log = (message) => process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);

if ([...args].some((arg) => !['--loop', '--once', '--dry-run'].includes(arg) && !/^--issue=\d+$/.test(arg))) {
  throw new Error('Unterstützt: --once, --loop, --dry-run und --issue=NUMMER');
}
if (issueArg && (!Number.isSafeInteger(issueNumber) || issueNumber <= 0)) {
  throw new Error('Ungültige Issue-Nummer');
}
if (loopMode && issueArg) throw new Error('--loop darf nicht mit --issue kombiniert werden.');

async function command(program, argv, { cwd = root, timeout = 120_000, env = process.env, input, allowFailure = false, maxChars = 500_000 } = {}) {
  const child = spawn(program, argv, { cwd, env, shell: process.platform === 'win32' && program === 'pnpm', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let truncated = false;
  const collect = (dest, data) => {
    const s = String(data);
    if (dest === 'out') stdout = (stdout + s).slice(-maxChars);
    else stderr = (stderr + s).slice(-maxChars);
    if (s.length >= maxChars) truncated = true;
  };
  child.stdout.on('data', (data) => collect('out', data));
  child.stderr.on('data', (data) => collect('err', data));
  if (input === undefined) child.stdin.end();
  else child.stdin.end(input);
  let timer;
  const code = await new Promise((resolve, reject) => {
    timer = setTimeout(() => { child.kill(); reject(new Error(`Zeitlimit ${Math.round(timeout/60000)} Minuten: ${program}`)); }, timeout);
    child.on('error', reject);
    child.on('close', resolve);
  }).finally(() => clearTimeout(timer));
  if (code !== 0 && !allowFailure) throw new Error(`${program} ${argv[0] ?? ''}: exit ${code}: ${stderr.slice(-2000)} ${stdout.slice(-800)}`);
  return {code, stdout, stderr, truncated};
}

async function gh(argv, options) {
  return command('gh', [...argv, '-R', REPOSITORY], options);
}

async function getQueue() {
  if (issueNumber !== null) {
    const result = await gh(['issue','view', String(issueNumber), '--json', 'number,title,body,author,labels,state,url']);
    const issue = JSON.parse(result.stdout);
    if (!isAuthorizedIssue(issue)) throw new Error(`Issue #${issueNumber} ist nicht autorisiert oder nicht bereit.`);
    return [issue];
  }
  const result = await gh(['issue', 'list', '--state','open', '--label',LABELS.ready,
    '--limit','100', '--json','number,title,body,author,labels,state,url']);
  return JSON.parse(result.stdout).filter(isAuthorizedIssue).sort((a,b) => a.number - b.number);
}

async function stateUpdate(issue, oldLabel, nextLabel, comment) {
  const changed = await gh(['issue','edit',String(issue.number), '--remove-label',oldLabel,'--add-label',nextLabel],{allowFailure:true});
  if (changed.code !== 0) throw new Error(`Label-Update für #${issue.number} fehlgeschlagen: ${changed.stderr.slice(-350)}`);
  if (comment) {
    const output = await gh(['issue','comment',String(issue.number),'--body',comment],{allowFailure:true});
    if (output.code !== 0) log(`WARNUNG: Kommentar zu #${issue.number} fehlgeschlagen.`);
  }
}

async function assertPrerequisites() {
  for (const program of ['git','gh','codex','node','pnpm']) await command(program,['--version']);
  await command('gh',['auth','status'],{timeout:30_000});
  const auth = await command('codex',['login','status'],{timeout:30_000});
  const output = `${auth.stdout}\n${auth.stderr}`;
  if (!/ChatGPT/i.test(output) || /logged in (using|with) (an? )?API key/i.test(output)) {
    throw new Error('Codex muss mit ChatGPT angemeldet sein (codex login), NICHT mit einem kostenpflichtigen API-Key.');
  }
  for (const p of ['AGENTS.md','CURRENT-GATE.md']) await readFile(path.join(root,p),'utf8');
  log('Voraussetzungen OK: Codex mit ChatGPT-Login, GitHub, Projektregeln.');
}

function isolatedCodexEnv() {
  const env = { ...process.env };
  // Do not expose provider secrets via environment variables to model tools.
  for (const key of Object.keys(env)) {
    if (/(TOKEN|SECRET|PASSWORD|DATABASE_URL|API_KEY|CLOUDFLARE|NEON|VERCEL|AWS_|GITHUB_|^GH_|PRIVATE_KEY|CREDENTIAL)/i.test(key)) delete env[key];
  }
  return env;
}

async function agentRun(workDir, issue, logsDir, index, repairLog) {
  const out = path.join(logsDir, `codex-${index}.jsonl`);
  const last = path.join(logsDir, `codex-${index}-summary.txt`);
  const prompt = buildPrompt(issue, { repairLog });
  // File-system sandbox and no interactive approval. Codex has no GitHub token and no API key.
  const cmd = ['exec','--sandbox','workspace-write','--ask-for-approval','never',
    '--json','--output-last-message',last,'-'];
  const child = spawn('codex',cmd,{cwd:workDir,env:isolatedCodexEnv(),shell:process.platform==='win32',windowsHide:true,stdio:['pipe','pipe','pipe']});
  await writeFile(out,'');
  const file = await open(out,'a');
  let endMessage = '';
  child.stdout.on('data',(chunk) => { void file.appendFile(chunk).catch(()=>{}); });
  child.stderr.on('data',(chunk) => { endMessage = (endMessage + String(chunk)).slice(-2500); });
  child.stdin.end(prompt);
  let timer;
  let code;
  try {
    code = await new Promise((resolve,reject) => {
      timer = setTimeout(() => { child.kill(); reject(new Error('Codex-Zeitlimit (75 Minuten) erreicht.')); },RUN_TIMEOUT);
      child.on('error',reject);
      child.on('close',resolve);
    });
  } finally { clearTimeout(timer); await file.close(); }
  const summary = await readFile(last,'utf8').catch(()=>'');
  log(`Codex-Versuch ${index}: ${code===0 ? 'fertig' : `FAIL ${code}`} – ${summary.slice(0,300).replace(/\s+/g,' ')}`);
  if (code !== 0) throw new Error(`Codex abgebrochen/fehlgeschlagen: ${endMessage}`);
  if (/\bBLOCKED\b/i.test(summary)) throw new Error(`Codex meldet BLOCKED: ${summary.slice(0,500)}`);
}

async function gitChangedPaths(dir) {
  const tracked = await command('git',['diff','HEAD','--name-only','--no-renames','-z'],{cwd:dir});
  const untracked = await command('git',['ls-files','--others','--exclude-standard','-z'],{cwd:dir});
  return [...tracked.stdout.split('\0'),...untracked.stdout.split('\0')].filter(Boolean);
}

async function assertPaths(dir) {
  const {changed,blocked} = checkChangedPaths(await gitChangedPaths(dir));
  if (blocked.length) throw new Error(`SCOPE-FAIL: Nicht freigegebene Dateiänderungen: ${blocked.join(', ')}`);
  if (!changed.length) throw new Error('Kein Code geändert. Nur Analyse ist kein fertiges Arbeitspaket.');
  await command('git',['diff','HEAD','--check'],{cwd:dir});
  return changed;
}

async function tests(dir) {
  log('Lokaler Typecheck + ULC Unit-Tests ...');
  await command('pnpm',['--filter','@appbasis/app-ulc-linz','typecheck'],{cwd:dir,timeout:15*60_000,maxChars:12_000});
  await command('pnpm',['--filter','@appbasis/app-ulc-linz','test'],{cwd:dir,timeout:20*60_000,maxChars:12_000});
  await assertPaths(dir);
}

async function commitAndPush(dir, branch, issue) {
  const paths = await assertPaths(dir);
  await command('git',['add','-A','--',...paths],{cwd:dir});
  const staged = (await command('git',['diff','--cached','--name-only','--no-renames','-z'],{cwd:dir})).stdout.split('\0').filter(Boolean);
  const {blocked} = checkChangedPaths(staged);
  if (blocked.length) throw new Error(`STAGING-FAIL: ${blocked.join(', ')}`);
  const modes = (await command('git',['ls-files','--stage','-z'],{cwd:dir})).stdout;
  const bad = modes.split('\0').filter((entry) => /^(120000|160000) /.test(entry) && staged.some((p) => entry.endsWith(`\t${p}`)));
  if (bad.length) throw new Error('Symlinks/Submodule-Änderungen sind nicht erlaubt.');
  await command('git',['diff','--cached','--check'],{cwd:dir});
  await command('git',['-c','user.name=ULC Autodev','-c','user.email=ulc-autodev@users.noreply.github.com',
    'commit','-m',`test(ULC autodev): issue #${issue.number}`],{cwd:dir});
  await command('git',['push','--set-upstream','origin',branch],{cwd:dir,timeout:5*60_000});
  return (await command('git',['rev-parse','HEAD'],{cwd:dir})).stdout.trim();
}

async function waitCI(prUrl) {
  const result = await gh(['pr','checks',prUrl,'--watch','--interval','30'],{timeout:CI_TIMEOUT,allowFailure:true,maxChars:8000});
  if (result.code === 0 && /pass|success|✓|✔/i.test(result.stdout)) return {status:'PASS', info:result.stdout.slice(-1300)};
  return {status:'FAIL', info:(result.stderr+'\n'+result.stdout).slice(-1400)};
}

async function failedRunLog(branch, sha) {
  const {stdout} = await gh(['run','list','--branch',branch,'--event','pull_request','--limit','30',
    '--json','databaseId,headSha,status,conclusion']);
  const relevant = JSON.parse(stdout).filter((x) => x.headSha === sha && x.conclusion === 'failure');
  if (!relevant.length) return 'Keine CI-Fehllogs für den aktuellen HEAD verfügbar; nicht auf Verdacht ändern.';
  const chunks=[];
  for (const run of relevant.slice(0,2)) {
    const lines = await gh(['run','view',String(run.databaseId),'--log-failed'],{allowFailure:true,maxChars:30000});
    chunks.push(`Run ${run.databaseId}:\n${lines.stdout.slice(-14000)}\n${lines.stderr.slice(-1000)}`);
  }
  return chunks.join('\n').slice(-18000);
}

async function processIssue(issue) {
  const temp = await mkdtemp(path.join(tmpdir(),`ulc-autodev-${issue.number}-`));
  const dir = path.join(temp,'appbasis');
  const logsDir = path.join(stateDir,'logs',`issue-${issue.number}-${Date.now()}`);
  await mkdir(logsDir,{recursive:true});
  let prUrl = null;
  let claimed = false;
  try {
    await stateUpdate(issue,LABELS.ready,LABELS.running,`🤖 Autodev startet Issue #${issue.number}. Keine Merges oder Deployments. Lokale Logs verbleiben auf dem Entwicklungsrechner.`);
    claimed = true;
    log(`Issue #${issue.number}: ${issue.title}`);
    await command('git',['clone','--depth','1','--branch','main',`https://github.com/${REPOSITORY}.git`,dir],{timeout:5*60_000});
    const branch = branchName(issue.number);
    await command('git',['switch','-c',branch],{cwd:dir});
    await readFile(path.join(dir,'CURRENT-GATE.md'),'utf8');
    await readFile(path.join(dir,'AGENTS.md'),'utf8');
    // Dependencies installed before the agent runs, not as arbitrary agent output.
    await command('pnpm',['install','--frozen-lockfile'],{cwd:dir,timeout:15*60_000,maxChars:10000});
    await agentRun(dir,issue,logsDir,1,null);
    await assertPaths(dir);
    await tests(dir);
    let sha = await commitAndPush(dir,branch,issue);
    const body = [
      `Automatisierter **Draft-PR** für #${issue.number}.`,
      '', '**Grenzen:** nur `apps/ulc-linz/`, keine Schema-/Deploy-/Workflow-Änderung.',
      '**Lokale Gates:** ULC-Typecheck und Unit-Tests.',
      '**Abnahme:** exakte HEAD-CI, mobile Prüfung durch den Betreiber, separate Merge-/Deployfreigabe.',
      '**Wichtig:** Codex-Änderungen sind nicht ungeprüft produktionsreif.',
    ].join('\n');
    const pr = await gh(['pr','create','--draft','--head',branch,'--base','main',
      '--title',`ULC Autodev #${issue.number}: ${issue.title.slice(0,90)}`,'--body',body],{cwd:dir});
    prUrl = pr.stdout.trim().split(/\s+/).find((s) => /^https:\/\//.test(s));
    if (!prUrl) throw new Error(`PR-Erstellung konnte nicht bestätigt werden: ${pr.stdout}`);
    for (let repair = 0; repair <= MAX_CODEX_REPAIRS; repair++) {
      log(`CI ${prUrl}, HEAD ${sha.slice(0,12)}, Prüflauf ${repair + 1}/${MAX_CODEX_REPAIRS + 1}`);
      const ci = await waitCI(prUrl);
      if (ci.status === 'PASS') {
        await stateUpdate(issue,LABELS.running,LABELS.review,
          `✅ **Technischer Gate-PASS** für Draft ${prUrl}\nHEAD: \`${sha}\`\nLokaler Typecheck/Tests und GitHub-CI PASS. **Handy-Abnahme, Merge und Deployment stehen aus.**`);
        log(`Issue #${issue.number}: CI PASS – wartet auf deine Abnahme. ${prUrl}`);
        return;
      }
      if (repair >= MAX_CODEX_REPAIRS) throw new Error(`CI nach ${repair+1} Durchläufen nicht PASS: ${ci.info}`);
      const diagnostic = await failedRunLog(branch,sha);
      if (diagnostic.includes('Keine CI-Fehllogs')) throw new Error(`CI nicht auswertbar: ${ci.info}`);
      log(`CI FAIL – gezielte Korrekturschleife ${repair+1}.`);
      await agentRun(dir,issue,logsDir,repair+2,diagnostic);
      await assertPaths(dir);
      await tests(dir);
      sha = await commitAndPush(dir,branch,issue);
    }
  } catch (error) {
    const where = prUrl ? `Draft-PR: ${prUrl}\n` : '';
    const safeError = String(error.message || error).slice(0,1700);
    log(`BLOCKED #${issue.number}: ${safeError}`);
    if (claimed) {
      try { await stateUpdate(issue,LABELS.running,LABELS.blocked,
        `🛑 **Autodev BLOCKED**\n${where}Grund: ${safeError}\nKeine automatische Freigabe, kein Merge/Deploy. Bitte prüfen und erst danach wieder \`${LABELS.ready}\` setzen.`); }
      catch (statusError) { log(`Status-Update fehlgeschlagen: ${statusError.message}`); }
    }
  } finally {
    await rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:500}).catch(()=>{});
  }
}

async function runOnce() {
  const tasks = await getQueue();
  if (!tasks.length) {log('Keine freigegebenen ULC-Aufträge vorhanden.');return;}
  const issue = tasks[0];
  if (dryRun) {log(`DRY RUN: würde Issue #${issue.number} bearbeiten: ${issue.title}. Keine Änderungen.`);return;}
  await processIssue(issue);
}

async function acquireLock() {
  await mkdir(stateDir,{recursive:true});
  const lock = path.join(stateDir,'runner.lock');
  try {await mkdir(lock);} catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pidFile = path.join(lock,'pid');
    const pid = Number(await readFile(pidFile,'utf8').catch(()=>'0'));
    if (pid > 0) {
      try {process.kill(pid,0); throw new Error(`ULC-Autodev läuft bereits (PID ${pid}).`);} catch(e) {if(e.code !== 'ESRCH') throw e;}
    }
    await rm(lock,{recursive:true,force:true});
    await mkdir(lock);
  }
  await writeFile(path.join(lock,'pid'),String(process.pid));
  return async()=>rm(lock,{recursive:true,force:true});
}

async function main() {
  const unlock = await acquireLock();
  try {
    if (!dryRun) await assertPrerequisites();
    do {
      try { await runOnce(); } catch (error) {
        log(`Run FAIL: ${error.message}`);
        if (!loopMode) throw error;
      }
      if (loopMode) {log(`Nächste Prüfung in ${intervalMinutes} Minuten. Abbruch mit Strg+C.`);await new Promise((resolve)=>setTimeout(resolve,intervalMinutes*60_000));}
    } while (loopMode);
  } finally { await unlock(); }
}

main().catch((error) => {console.error(error);process.exitCode=1;});
