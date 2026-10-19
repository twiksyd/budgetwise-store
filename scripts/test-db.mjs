// Database tests without psql (e.g. Windows + a portable PostgreSQL such as
// embedded-postgres). Same sequence as scripts/test-db.sh, plus 0025 through 0034.
// Runs ONLY against a throwaway LOCAL server — never production:
//
//   PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres node scripts/test-db.mjs
//
// Each run creates two fresh databases and drops them afterwards.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HOST = process.env.PGHOST ?? "127.0.0.1";
if (!["127.0.0.1", "localhost", "::1"].includes(HOST)) {
  console.error(`Refusing to run database tests against a non-local host: ${HOST}`);
  process.exit(1);
}
const base = { host: HOST, port: Number(process.env.PGPORT ?? 5432), user: process.env.PGUSER ?? "postgres", password: process.env.PGPASSWORD };
const TESTS = join(dirname(fileURLToPath(import.meta.url)), "../supabase/tests");
// Like psql: timestamps stay text (a JS Date would drop microseconds).
for (const oid of [1082, 1114, 1184]) pg.types.setTypeParser(oid, (value) => value);

const MAIN = `bw_test_main_${process.pid}`;
const ROLL = `bw_test_rollback_${process.pid}`;
const REGR = `bw_test_regression_${process.pid}`;
let failures = 0;
// --baseline: only the original test-db.sh sequence (no 0025/0026).
const BASELINE = process.argv.includes("--baseline");
const later = (fn) => (BASELINE ? Promise.resolve() : fn());

async function withDb(db, fn) {
  const client = new pg.Client({ ...base, database: db });
  const notices = [];
  client.on("notice", (notice) => notices.push(notice.message));
  await client.connect();
  try {
    return await fn(client, notices);
  } finally {
    await client.end();
  }
}
const admin = (sql) => withDb("postgres", (client) => client.query(sql));

// ---- the few psql features the test files use: \set, :name, \echo, \i
/** psql's quoted \set value: '''x''' -> 'x' (doubled quotes inside quotes). */
function psqlValue(raw) {
  const value = raw.trim();
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

/** :name -> value, but (like psql) never inside quoted literals, dollar-quoted bodies or comments. */
function interpolate(sql, vars) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      const stop = end < 0 ? sql.length : end + dollar[0].length;
      out += sql.slice(i, stop);
      i = stop;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      const stop = end < 0 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
    } else {
      const quoted = /^:'([A-Za-z_][A-Za-z0-9_]*)'/.exec(rest);
      const variable = /^:([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
      if (quoted && Object.hasOwn(vars, quoted[1])) {
        out += `'${String(vars[quoted[1]]).replace(/'/g, "''")}'`;
        i += quoted[0].length;
      } else if (variable && sql[i - 1] !== ":" && Object.hasOwn(vars, variable[1])) {
        out += vars[variable[1]];
        i += variable[0].length;
      } else {
        out += sql[i];
        i += 1;
      }
    }
  }
  return out;
}

/** Top-level statements, each sent on its own (own transaction, own now()) like psql. */
function splitStatements(sql) {
  const statements = [];
  let rest = sql;
  for (;;) {
    const first = firstStatementEnd(rest);
    if (!first) break;
    statements.push(rest.slice(0, first));
    rest = rest.slice(first);
  }
  if (rest.trim()) statements.push(rest);
  return statements.filter((statement) => statement.replace(/--[^\n]*/g, "").trim());
}

function firstStatementEnd(sql) {
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      i = end < 0 ? sql.length : end + dollar[0].length;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      i = j + 1;
    } else if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      i = end < 0 ? sql.length : end;
    } else {
      if (sql[i] === ";") return i + 1;
      i += 1;
    }
  }
  return 0;
}

/** Index just after the last top-level ';' (outside quotes, dollar quotes, comments), or 0. */
function lastStatementStart(sql) {
  let last = 0;
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      i = end < 0 ? sql.length : end + dollar[0].length;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      i = j + 1;
    } else if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      i = end < 0 ? sql.length : end;
    } else {
      if (sql[i] === ";") last = i + 1;
      i += 1;
    }
  }
  return last;
}

/** Runs a .sql file the way psql would, returning \echo lines and notices in order. */
async function runScript(client, notices, path, vars = {}, output = []) {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  let chunk = [];
  const flush = async () => {
    const sql = chunk.join("\n");
    chunk = [];
    if (!sql.trim()) return;
    for (const statement of splitStatements(interpolate(sql, vars))) {
      notices.length = 0;
      try {
        await client.query(statement);
      } finally {
        output.push(...notices);
      }
    }
  };
  for (const line of text.split("\n")) {
    const gset = /^(.*)\\gset\s*$/.exec(line);
    if (gset) {
      // Everything before the last ';' runs as usual; the query being
      // written stores its single row into variables (psql's \gset).
      chunk.push(gset[1]);
      const buffer = chunk.join("\n");
      const start = lastStatementStart(buffer);
      chunk = [buffer.slice(0, start)];
      await flush();
      notices.length = 0;
      const result = await client.query(interpolate(buffer.slice(start), vars));
      output.push(...notices);
      if (result.rows.length !== 1) throw new Error(`\\gset expected exactly one row, got ${result.rows.length}`);
      for (const [name, value] of Object.entries(result.rows[0])) {
        vars[name] = value instanceof Date ? value.toISOString() : value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
      }
      continue;
    }
    const meta = /^\\(\w+)\s*(.*)$/.exec(line);
    if (!meta) {
      chunk.push(line);
      continue;
    }
    await flush();
    const [, command, arg] = meta;
    if (command === "set") {
      const [name, ...value] = arg.split(/\s+/);
      vars[name] = psqlValue(value.join(" "));
    } else if (command === "echo") {
      output.push(psqlValue(arg));
    } else if (command === "i") {
      await runScript(client, notices, join(TESTS, psqlValue(arg)), vars, output);
    } else {
      throw new Error(`Unsupported psql command \\${command} in ${path}`);
    }
  }
  await flush();
  return output;
}

/** Apply a migration/setup file; any error fails the run. */
async function apply(db, name) {
  await withDb(db, async (client, notices) => {
    try {
      await runScript(client, notices, join(TESTS, name));
    } catch (error) {
      throw new Error(`Failed applying ${name}: ${error.message}`);
    }
  });
}

/** Run a test file: prints its "ok - ..." notices; an exception is a failure. */
async function check(db, name) {
  await withDb(db, async (client, notices) => {
    const output = [];
    try {
      await runScript(client, notices, join(TESTS, name), {}, output);
    } catch (error) {
      failures += 1;
      for (const line of output) if (/^ok - |^--- /.test(line)) console.log(line);
      console.log(`FAIL in ${name}: ${error.message}`);
      return;
    }
    for (const line of output) if (/^ok - |^--- |PASSED/.test(line)) console.log(line);
  });
}

async function expectFailure(db, name, label) {
  try {
    await apply(db, name);
    failures += 1;
    console.log(`FAIL: ${label}`);
  } catch {
    console.log(`ok - ${label}`);
  }
}

/**
 * Two admins confirm the same payment card at the same moment, on two real
 * connections: the second waits for the first's lock, then gets the first
 * confirmation back. Exactly one row and one audit entry.
 */
async function concurrentConfirmations(db) {
  const label = "two admins confirming at the same moment create one confirmation";
  const robert = "00000000-0000-0000-0000-0000000000a1";
  const andre = "00000000-0000-0000-0000-0000000000a2";
  try {
    await withDb(db, async (setup) => {
      await setup.query(`insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
          buyer_name, buyer_roblox_username, total_amount, owner_user_id)
        values ('BW-RACE27', 'idem-race-0027-00000000', repeat('9', 64), repeat('9', 64), 'Race', 'raceRBX', 120,
          '00000000-0000-0000-0000-0000000000c1')`);
      await setup.query(`insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
        values ('BW-RACE27', 'customer', '00000000-0000-0000-0000-0000000000c1', 'slip', 'SLIP')`);
      const method = await setup.query("select id from store_payment_methods where is_active limit 1");
      const sent = await setup.query("select store_send_payment_details('BW-RACE27', $1, $2, gen_random_uuid()) as id", [robert, method.rows[0].id]);
      const messageId = sent.rows[0].id;
      const confirm = "select store_confirm_payment('BW-RACE27', $1, $2) as result";
      await withDb(db, (first) => withDb(db, async (second) => {
        await first.query("begin");
        const a = await first.query(confirm, [messageId, robert]);
        const pending = second.query(confirm, [messageId, andre]);
        await new Promise((resolve) => setTimeout(resolve, 300)); // second is now waiting on the lock
        await first.query("commit");
        const b = await pending;
        const counts = await setup.query(`select
            (select count(*)::int from store_payment_confirmations where order_number = 'BW-RACE27') as rows,
            (select count(*)::int from store_chat_audit_log where action = 'payment.confirmed' and order_number = 'BW-RACE27') as audits`);
        const ok = a.rows[0].result.created === true
          && b.rows[0].result.created === false
          && b.rows[0].result.confirmation.confirmed_by === robert
          && counts.rows[0].rows === 1 && counts.rows[0].audits === 1;
        if (!ok) throw new Error(JSON.stringify({ a: a.rows[0], b: b.rows[0], counts: counts.rows[0] }));
      }));
    });
    console.log(`ok - ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL: ${label}: ${error.message}`);
  }
}

/**
 * 0029: two admins send payment details to the same Unassigned chat at the
 * same moment, and a manual assignment races a payment card. Ownership is
 * always one admin with one audit entry.
 */
async function concurrentAutoAssign(db) {
  const robert = "00000000-0000-0000-0000-0000000000a1";
  const andre = "00000000-0000-0000-0000-0000000000a2";
  const kenneth = "00000000-0000-0000-0000-0000000000a3";
  const order = async (setup, key) => {
    await setup.query(`insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
        buyer_name, buyer_roblox_username, total_amount, owner_user_id)
      values ($1, 'idem-' || lower($1) || '-race-0029', repeat('8', 64), repeat('8', 64), 'Race', 'raceRBX', 90,
        '00000000-0000-0000-0000-0000000000c1')`, [key]);
    await setup.query(`insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
      values ($1, 'customer', '00000000-0000-0000-0000-0000000000c1', 'slip', 'SLIP')`, [key]);
  };
  const audits = (setup, key) =>
    setup.query("select count(*)::int as n from store_chat_audit_log where order_number = $1 and action = 'conversation.assigned'", [key]);
  const owner = (setup, key) =>
    setup.query("select assigned_admin_id as id from store_order_conversations where order_number = $1", [key]);
  const send = "select store_send_payment_details($1, $2, (select id from store_payment_methods where is_active limit 1), gen_random_uuid())";

  for (const [label, run] of [
    ["two admins sending payment details at once: one owner, one audit entry", async (setup, first, second) => {
      await order(setup, "BW-RACEP1");
      await first.query("begin");
      await first.query(send, ["BW-RACEP1", robert]);
      const pending = second.query(send, ["BW-RACEP1", andre]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await first.query("commit");
      await pending;
      const [o, a] = [await owner(setup, "BW-RACEP1"), await audits(setup, "BW-RACEP1")];
      if (o.rows[0].id !== robert || a.rows[0].n !== 1) throw new Error(JSON.stringify({ owner: o.rows[0], audits: a.rows[0] }));
    }],
    ["manual assignment committed first wins over a racing payment card", async (setup, first, second) => {
      await order(setup, "BW-RACEP2");
      await first.query("begin");
      await first.query("select store_assign_conversation('BW-RACEP2', $1, $2)", [kenneth, robert]);
      const pending = second.query(send, ["BW-RACEP2", andre]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await first.query("commit");
      await pending;
      const [o, a] = [await owner(setup, "BW-RACEP2"), await audits(setup, "BW-RACEP2")];
      if (o.rows[0].id !== kenneth || a.rows[0].n !== 1) throw new Error(JSON.stringify({ owner: o.rows[0], audits: a.rows[0] }));
    }],
  ]) {
    try {
      await withDb(db, (setup) => withDb(db, (first) => withDb(db, (second) => run(setup, first, second))));
      console.log(`ok - ${label}`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL: ${label}: ${error.message}`);
    }
  }
}

/**
 * 0031: two admins send quotes to the same Unassigned General Inquiry at the
 * same moment (one owner, one audit entry), then two admins confirm the
 * latest quote at once (one confirmation).
 */
async function concurrentInquiryPayments(db) {
  const robert = "00000000-0000-0000-0000-0000000000a1";
  const andre = "00000000-0000-0000-0000-0000000000a2";
  const customer = "00000000-0000-0000-0000-0000000000d7";
  const label = "two admins quoting / confirming an inquiry at once: one owner, one audit entry, one confirmation";
  try {
    await withDb(db, (setup) => withDb(db, (first) => withDb(db, async (second) => {
      await setup.query("insert into auth.users (id, email) values ($1, 'race31@x.test') on conflict do nothing", [customer]);
      const key = (await setup.query("select store_open_inquiry($1, 'Race') as key", [customer])).rows[0].key;
      await setup.query("select store_post_message($1, 'customer', $2, 'text', 'price?', null, null, gen_random_uuid())", [key, customer]);
      const method = (await setup.query("select id from store_payment_methods where is_active limit 1")).rows[0].id;
      const send = "select store_send_inquiry_payment_details($1, $2, $3, 150, gen_random_uuid()) as id";
      await first.query("begin");
      await first.query(send, [key, robert, method]);
      const pending = second.query(send, [key, andre, method]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await first.query("commit");
      const latest = (await pending).rows[0].id;
      const confirm = "select store_confirm_payment($1, $2, $3) as r";
      await first.query("begin");
      const a = (await first.query(confirm, [key, latest, robert])).rows[0].r;
      const pendingConfirm = second.query(confirm, [key, latest, andre]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await first.query("commit");
      const b = (await pendingConfirm).rows[0].r;
      const facts = (await setup.query(`select
          (select assigned_admin_id from store_order_conversations where order_number = $1) as owner,
          (select count(*)::int from store_chat_audit_log where order_number = $1 and action = 'conversation.assigned') as audits,
          (select count(*)::int from store_payment_confirmations where order_number = $1) as confirmations`, [key])).rows[0];
      const ok = facts.owner === robert && facts.audits === 1 && facts.confirmations === 1 && a.created === true && b.created === false;
      if (!ok) throw new Error(JSON.stringify({ facts, a, b }));
    })));
    console.log(`ok - ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL: ${label}: ${error.message}`);
  }
}

/**
 * 0032: the same admin reacting from two tabs at once, and two admins
 * reacting at once: one row per person, counts consistent.
 */
async function concurrentReactions(db) {
  const robert = "00000000-0000-0000-0000-0000000000a1";
  const andre = "00000000-0000-0000-0000-0000000000a2";
  const label = "simultaneous reactions: one row per person, consistent counts";
  try {
    await withDb(db, (setup) => withDb(db, (first) => withDb(db, async (second) => {
      const message = (await setup.query("select id from store_order_messages where order_number = 'BW-RCT032' and kind = 'text' order by created_at limit 1")).rows[0].id;
      const react = "select store_set_reaction('BW-RCT032', $1, $2, 'admin', $3) as s";
      await Promise.all([first.query(react, [message, robert, "wow"]), second.query(react, [message, robert, "sad"])]);
      await Promise.all([first.query(react, [message, andre, "love"]), second.query(react, [message, robert, "love"])]);
      const facts = (await setup.query(`select
          (select count(*)::int from store_message_reactions where message_id = $1 and actor_user_id = $2) as robert_rows,
          (select count(*)::int from store_message_reactions where message_id = $1 and actor_role = 'admin') as admin_rows,
          store_reaction_summary($1) as summary`, [message, robert])).rows[0];
      const ok = facts.robert_rows === 1 && facts.admin_rows === 2 && facts.summary.counts.love >= 2;
      if (!ok) throw new Error(JSON.stringify(facts));
    })));
    console.log(`ok - ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL: ${label}: ${error.message}`);
  }
}

/**
 * 0033: a customer with no conversation yet places two orders at the same
 * moment (two connections), and one checkout is replayed concurrently:
 * one conversation, one slip per order, both orders in it.
 */
async function concurrentAttach(db) {
  const customer = "00000000-0000-0000-0000-0000000000e9";
  const label = "simultaneous checkouts: one conversation, one slip per order";
  try {
    await withDb(db, (setup) => withDb(db, (first) => withDb(db, async (second) => {
      await setup.query("insert into auth.users (id, email) values ($1, 'race33@gmail.test')", [customer]);
      for (const key of ["BW-RACE33A", "BW-RACE33B"]) {
        await setup.query(`insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
            buyer_name, buyer_roblox_username, total_amount)
          values ($1, 'idem-' || lower($1) || '-race-0033', repeat('6', 64), repeat('6', 64), 'Race', 'raceRBX', 60)`, [key]);
      }
      const attach = "select store_attach_order_to_customer($1, $2, 'SLIP', 'Race', null) ->> 'chat_key' as key";
      const [a, b] = await Promise.all([first.query(attach, ["BW-RACE33A", customer]), second.query(attach, ["BW-RACE33B", customer])]);
      const [c, d] = await Promise.all([first.query(attach, ["BW-RACE33A", customer]), second.query(attach, ["BW-RACE33A", customer])]);
      const facts = (await setup.query(`select
          (select count(*)::int from store_chat_threads where kind = 'inquiry' and owner_user_id = $1) as conversations,
          (select count(*)::int from store_order_messages where kind = 'slip' and order_ref in ('BW-RACE33A', 'BW-RACE33B')) as slips`,
        [customer])).rows[0];
      const keys = new Set([a.rows[0].key, b.rows[0].key, c.rows[0].key, d.rows[0].key]);
      if (facts.conversations !== 1 || facts.slips !== 2 || keys.size !== 1) throw new Error(JSON.stringify({ ...facts, keys: [...keys] }));
    })));
    console.log(`ok - ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL: ${label}: ${error.message}`);
  }
}

async function concurrentHistory(db) {
  const actor = "00000000-0000-0000-0000-0000000000a1";
  const customer = "00000000-0000-0000-0000-000000003501";
  const seed = async (c, key) => {
    await c.query(`insert into store_order_snapshots(order_number,idempotency_key,request_fingerprint,view_token_hash,buyer_name,buyer_roblox_username,total_amount,owner_user_id)
      values($1,'race-history-'||$1,repeat('5',64),repeat('5',64),'Same Name','same',150,$2)`,[key,customer]);
    await c.query(`insert into store_order_line_snapshots(order_number,line_index,product_name,game_name,robux_amount,quantity,unit_price,line_total)
      values($1,0,'Test','Game',100,1,150,150)`,[key]);
    await c.query("insert into orders(order_number,buyer_name,buyer_roblox_username,status) values($1,'Same Name','same','delivered')",[key]);
    const { rows } = await c.query("select store_post_message($1,'customer',$2,'text','History',null,null,gen_random_uuid()) as posted",[key,customer]);
    const message = rows[0].posted.message.id;
    await c.query("select store_mark_admin_read($1,user_id,$2) from admin_users",[key,message]);
    await c.query("select store_set_conversation_state($1,$2,'done',$3)",[key,actor,message]);
  };
  await withDb(db, async setup => {
    for (const key of ['BW-HRACE1','BW-HRACE2','BW-HRACE3','BW-HRACE4']) await seed(setup,key);
    await withDb(db, first => withDb(db, async second => {
      const link = "select store_link_historical_chat($1,$2) as linked";
      const results = await Promise.all([first.query(link,['BW-HRACE1',actor]),second.query(link,['BW-HRACE2',actor])]);
      if (!results.every(r=>r.rows[0].linked)) throw new Error('different-source linking failed');
      const retry = await Promise.all([first.query(link,['BW-HRACE1',actor]),second.query(link,['BW-HRACE1',actor])]);
      if (!retry.every(r=>r.rows[0].linked)) throw new Error('idempotent concurrent retries failed');
      await first.query('begin');
      await first.query("select store_post_message('BW-HRACE3','customer',$1,'text','New unresolved work',null,null,gen_random_uuid())",[customer]);
      const waiting = second.query(link,['BW-HRACE3',actor]);
      await first.query('commit');
      if ((await waiting).rows[0].linked) throw new Error('link hid a concurrent customer message');
      await first.query('begin');
      await first.query(link,['BW-HRACE4',actor]);
      const rejected = second.query("select store_post_message('BW-HRACE4','customer',$1,'text','Old tab',null,null,gen_random_uuid())",[customer]).then(()=>null,e=>e.code);
      await first.query('commit');
      if ((await rejected) !== 'BW030') throw new Error('old tab wrote after concurrent link');
    }));
  });
  console.log('ok - concurrent different-source links, duplicate retries, message-before-link and link-before-message');
}

async function concurrentCompatibility(db) {
  const actor = "00000000-0000-0000-0000-0000000000a1";
  const owner = "00000000-0000-0000-0000-000000003610";
  const batch = "00000000-0000-0000-0000-000000003611";
  await withDb(db, async c => {
    await c.query("insert into auth.users(id,email) values($1,'compat-race@test.local')",[owner]);
    for (const key of ['BW-CRACE1','BW-CRACE2']) {
      await c.query(`insert into store_order_snapshots(order_number,idempotency_key,request_fingerprint,view_token_hash,buyer_name,buyer_roblox_username,total_amount,owner_user_id)
      values($1,'compat-race-'||$1,repeat('5',64),repeat('5',64),'Customer','customer',150,$2)`,[key,owner]);
      await c.query("insert into orders(order_number,buyer_name,buyer_roblox_username,status) values($1,'Customer','customer','delivered')",[key]);
      await c.query("insert into store_order_line_snapshots(order_number,line_index,product_name,game_name,robux_amount,quantity,unit_price,line_total) values($1,0,'Test','Game',100,1,150,150)",[key]);
      const {rows}=await c.query("select store_post_message($1,'customer',$2,'text','Unread historical work',null,null,gen_random_uuid()) as posted",[key,owner]);
      await c.query("select store_set_conversation_state($1,$2,'done',$3)",[key,actor,rows[0].posted.message.id]);
    }
  });
  await withDb(db, first => withDb(db, async second => {
    const init="select store_initialize_customer_conversation($1,$2) as home";
    const results=await Promise.all([first.query(init,[owner,actor]),second.query(init,[owner,actor])]);
    if(results[0].rows[0].home!==results[1].rows[0].home) throw new Error('concurrent initialization duplicated customer identity');
    const audit=await first.query("select count(*)::int n from store_history_operations where customer_id=$1 and operation='initialize'",[owner]);
    if(audit.rows[0].n!==1) throw new Error('concurrent initialization was not idempotent');
    const home=results[0].rows[0].home;
    await first.query("delete from store_order_conversations where order_number=$1",[home]);
    await Promise.all([
      first.query(init,[owner,actor]),
      second.query("select store_post_message($1,'customer',$2,'text','Concurrent real inquiry',null,null,gen_random_uuid())",[home,owner])
    ]);
    const activity=await first.query("select c.last_message_id=m.id correct from store_order_conversations c join lateral(select id from store_order_messages where order_number=c.order_number order by created_at desc,id desc limit 1) m on true where c.order_number=$1",[home]);
    if(activity.rows[0]?.correct!==true) throw new Error('initializer/message race lost real activity');
    await first.query("update store_chat_settings set historical_chat_enabled=true,historical_chat_compat_ready=true where id");
    await first.query("select store_approve_history_batch($1,$2,$3,now()+interval '1 hour')",[['BW-CRACE1','BW-CRACE2'],actor,batch]);
    const linked=await Promise.all([
      first.query("select * from store_link_history_batch($1,$2,$3)",[['BW-CRACE1','BW-CRACE2'],actor,batch]),
      second.query("select store_link_historical_chat($1,$2) as linked",['BW-CRACE2',actor])
    ]);
    if(!linked.every(r=>r.rows.every(row=>row.linked))) throw new Error('concurrent scoped batch/direct linking failed');
    const reread=await first.query("select * from store_link_history_batch($1,$2,$3)",[['BW-CRACE2','BW-CRACE1'],actor,batch]);
    if(!reread.rows.every(r=>r.linked)) throw new Error('bounded linking retry failed');
    const count=await first.query("select count(*)::int n from store_chat_history_links where owner_user_id=$1",[owner]);
    if(count.rows[0].n!==2) throw new Error('duplicate or missing scoped mapping');
    const cursors=await first.query("select count(*)::int n from store_conversation_reads where order_number=any($1)",[['BW-CRACE1','BW-CRACE2']]);
    if(cursors.rows[0].n!==0) throw new Error('concurrent linking fabricated read cursors');
  }));
  console.log('ok - concurrent empty initialization, scoped batch/direct linking, idempotent retries, missing-cursor preservation');
}

async function freshBase(db) {
  await admin(`create database ${db}`);
  for (const name of [
    "00_supabase_stub.sql",
    "../migrations/0019_store_order_integrity.sql",
    "../migrations/0020_store_customer_accounts_and_order_chat.sql",
    "10_seed_pre_0021.sql",
    "15_capture_pre_0021.sql",
    "../migrations/0021_store_shared_admin_inbox.sql",
  ]) await apply(db, name);
}

async function run() {
  if (process.argv.includes("--history-only")) {
    await freshBase(MAIN);
    for (const name of [
      "0022_store_order_fulfillment_details.sql", "0024_store_conversation_workflow_and_albums.sql",
      "0025_store_admin_public_usernames.sql", "0026_store_general_inquiries.sql",
      "0027_store_payment_received.sql", "0028_store_inbox_reply_state.sql",
      "0029_store_inbox_assign_games_avatars.sql", "0030_store_inbox_attention_filters.sql",
      "0031_store_inquiry_payment_details.sql", "0032_store_message_reactions_and_replies.sql",
      "0033_store_unified_customer_thread.sql", "0034_store_vouch_requests.sql",
      "0035_store_historical_chat_links.sql", "0035_store_historical_chat_links.sql",
    ]) await apply(MAIN, `../migrations/${name}`);
    await check(MAIN, "38_historical_chat_test.sql");
    await concurrentHistory(MAIN);
    await check(MAIN, "39_historical_performance_test.sql");
    await apply(MAIN, "../migrations/0036_store_historical_chat_compatibility.sql");
    await apply(MAIN, "../migrations/0036_store_historical_chat_compatibility.sql");
    await check(MAIN, "40_historical_compatibility_test.sql");
    await concurrentCompatibility(MAIN);
    await check(MAIN, "39_historical_performance_test.sql");
    return;
  }
  // ---- Database 1: the production path (0023 is NOT applied in production),
  // then the same objects after 0023 as well.
  await freshBase(MAIN);
  await apply(MAIN, "../migrations/0021_store_shared_admin_inbox.sql"); // second run
  await check(MAIN, "20_shared_inbox_test.sql");
  await apply(MAIN, "../migrations/0022_store_order_fulfillment_details.sql");
  await apply(MAIN, "../migrations/0022_store_order_fulfillment_details.sql");
  await check(MAIN, "25_fulfillment_test.sql");
  await apply(MAIN, "../migrations/0024_store_conversation_workflow_and_albums.sql");
  await apply(MAIN, "../migrations/0024_store_conversation_workflow_and_albums.sql");
  await check(MAIN, "26_workflow_albums_test.sql");
  await later(() => apply(MAIN, "../migrations/0025_store_admin_public_usernames.sql"));
  await later(() => apply(MAIN, "../migrations/0025_store_admin_public_usernames.sql"));
  await later(() => check(MAIN, "27_public_usernames_test.sql"));
  await later(() => apply(MAIN, "../migrations/0026_store_general_inquiries.sql"));
  await later(() => apply(MAIN, "../migrations/0026_store_general_inquiries.sql")); // second run
  await later(() => check(MAIN, "28_general_inquiry_test.sql"));
  await later(() => apply(MAIN, "../migrations/0027_store_payment_received.sql"));
  await later(() => apply(MAIN, "../migrations/0027_store_payment_received.sql")); // second run
  await later(() => check(MAIN, "29_payment_received_test.sql"));
  await later(() => concurrentConfirmations(MAIN));
  await later(() => apply(MAIN, "../migrations/0028_store_inbox_reply_state.sql"));
  await later(() => apply(MAIN, "../migrations/0028_store_inbox_reply_state.sql")); // second run
  await later(() => check(MAIN, "31_inbox_reply_state_test.sql"));
  await later(() => apply(MAIN, "../migrations/0029_store_inbox_assign_games_avatars.sql"));
  await later(() => apply(MAIN, "../migrations/0029_store_inbox_assign_games_avatars.sql")); // second run
  await later(() => check(MAIN, "32_assign_games_avatars_test.sql"));
  await later(() => concurrentAutoAssign(MAIN));
  await later(() => apply(MAIN, "../migrations/0030_store_inbox_attention_filters.sql"));
  await later(() => apply(MAIN, "../migrations/0030_store_inbox_attention_filters.sql")); // second run
  await later(() => check(MAIN, "33_attention_filters_test.sql"));
  await later(() => apply(MAIN, "../migrations/0031_store_inquiry_payment_details.sql"));
  await later(() => apply(MAIN, "../migrations/0031_store_inquiry_payment_details.sql")); // second run
  await later(() => check(MAIN, "34_inquiry_payment_test.sql"));
  await later(() => concurrentInquiryPayments(MAIN));
  await later(() => apply(MAIN, "../migrations/0032_store_message_reactions_and_replies.sql"));
  await later(() => apply(MAIN, "../migrations/0032_store_message_reactions_and_replies.sql")); // second run
  await later(() => check(MAIN, "35_reactions_replies_test.sql"));
  await later(() => concurrentReactions(MAIN));
  await later(() => apply(MAIN, "../migrations/0033_store_unified_customer_thread.sql"));
  await later(() => apply(MAIN, "../migrations/0033_store_unified_customer_thread.sql")); // second run
  await later(() => check(MAIN, "36_unified_thread_test.sql"));
  await later(() => concurrentAttach(MAIN));
  await later(() => apply(MAIN, "../migrations/0034_store_vouch_requests.sql"));
  await later(() => apply(MAIN, "../migrations/0034_store_vouch_requests.sql")); // second run
  await later(() => check(MAIN, "37_vouch_request_test.sql"));
  await later(() => apply(MAIN, "../migrations/0035_store_historical_chat_links.sql"));
  await later(() => apply(MAIN, "../migrations/0035_store_historical_chat_links.sql"));
  await later(() => check(MAIN, "38_historical_chat_test.sql"));
  await later(() => concurrentHistory(MAIN));
  await later(() => check(MAIN, "39_historical_performance_test.sql"));
  await later(() => apply(MAIN, "../migrations/0036_store_historical_chat_compatibility.sql"));
  await later(() => apply(MAIN, "../migrations/0036_store_historical_chat_compatibility.sql"));
  await later(() => check(MAIN, "40_historical_compatibility_test.sql"));
  await later(() => concurrentCompatibility(MAIN));
  await later(() => check(MAIN, "39_historical_performance_test.sql"));
  if (!process.argv.includes("--without-legacy-cleanup")) {
  // The repository's own sequence also covers a database where 0023 ran
  // (throwaway local database only; production never runs 0023 here).
  await apply(MAIN, "../migrations/0023_store_chat_legacy_cleanup.sql");
  await check(MAIN, "30_cleanup_test.sql");
  // 0024, 0025 and 0026 still apply cleanly on top of 0023.
  await apply(MAIN, "../migrations/0024_store_conversation_workflow_and_albums.sql");
  await later(() => apply(MAIN, "../migrations/0025_store_admin_public_usernames.sql"));
  await later(() => apply(MAIN, "../migrations/0026_store_general_inquiries.sql"));
  await later(() => apply(MAIN, "../migrations/0027_store_payment_received.sql"));
  await later(() => apply(MAIN, "../migrations/0028_store_inbox_reply_state.sql"));
  await later(() => apply(MAIN, "../migrations/0029_store_inbox_assign_games_avatars.sql"));
  await later(() => apply(MAIN, "../migrations/0030_store_inbox_attention_filters.sql"));
  await later(() => apply(MAIN, "../migrations/0031_store_inquiry_payment_details.sql"));
  await later(() => apply(MAIN, "../migrations/0032_store_message_reactions_and_replies.sql"));
  await later(() => apply(MAIN, "../migrations/0033_store_unified_customer_thread.sql"));
  await later(() => apply(MAIN, "../migrations/0034_store_vouch_requests.sql"));

  }
  // ---- Database 2: rollbacks.
  await freshBase(ROLL);
  await check(ROLL, "40_rollback_test.sql");
  await apply(ROLL, "../migrations/0022_store_order_fulfillment_details.sql");
  await apply(ROLL, "../migrations/0024_store_conversation_workflow_and_albums.sql");
  await withDb(ROLL, (c) => c.query("insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body) values ('BW-AAAAAA', 'admin', '00000000-0000-0000-0000-0000000000a1', 'album', '')"));
  await expectFailure(ROLL, "../rollback/0024_down.sql", "0024 rollback refuses while an album exists");
  await withDb(ROLL, (c) => c.query("delete from store_order_messages where kind = 'album'; update store_order_conversations set last_message_kind = 'text' where last_message_kind = 'album'"));
  await check(ROLL, "43_albums_before_flatten.sql");
  await apply(ROLL, "../rollback/0024_flatten_albums.sql");
  await check(ROLL, "44_flatten_albums_test.sql");
  await apply(ROLL, "../rollback/0024_flatten_albums.sql");
  await apply(ROLL, "../rollback/0024_down.sql");
  await check(ROLL, "45_rollback_0024_test.sql");
  await apply(ROLL, "../migrations/0024_store_conversation_workflow_and_albums.sql");
  // 0025 / 0026 round trips.
  await later(() => apply(ROLL, "../migrations/0025_store_admin_public_usernames.sql"));
  await later(() => apply(ROLL, "../migrations/0026_store_general_inquiries.sql"));
  await later(() => check(ROLL, "46_rollback_0026_before.sql"));
  await later(() => expectFailure(ROLL, "../rollback/0026_down.sql", "0026 rollback refuses while a General Inquiry has messages"));
  await later(() => withDb(ROLL, (c) => c.query("delete from store_chat_threads where kind = 'inquiry'")));
  await later(() => apply(ROLL, "../rollback/0026_down.sql"));
  await later(() => check(ROLL, "47_rollback_0026_test.sql"));
  await later(() => apply(ROLL, "../migrations/0026_store_general_inquiries.sql")); // re-apply after rollback
  // 0027 round trip: refused while a confirmation exists.
  await later(() => apply(ROLL, "../migrations/0027_store_payment_received.sql"));
  await later(() => withDb(ROLL, (c) => c.query(`insert into store_payment_confirmations (message_id, order_number, amount, provider, account_number)
    select id, order_number, 1, 'gcash', '0917' from store_order_messages where order_number = 'BW-AAAAAA' limit 1`)));
  await later(() => expectFailure(ROLL, "../rollback/0027_down.sql", "0027 rollback refuses while a payment confirmation exists"));
  await later(() => withDb(ROLL, (c) => c.query("delete from store_payment_confirmations")));
  await later(() => apply(ROLL, "../rollback/0027_down.sql"));
  await later(() => check(ROLL, "48_rollback_0027_test.sql"));
  await later(() => apply(ROLL, "../migrations/0027_store_payment_received.sql")); // re-apply after rollback
  // 0028 round trip.
  await later(() => apply(ROLL, "../migrations/0028_store_inbox_reply_state.sql"));
  await later(() => apply(ROLL, "../rollback/0028_down.sql"));
  await later(() => check(ROLL, "49_rollback_0028_test.sql"));
  await later(() => apply(ROLL, "../migrations/0028_store_inbox_reply_state.sql")); // re-apply after rollback
  // 0029 round trip.
  await later(() => apply(ROLL, "../migrations/0029_store_inbox_assign_games_avatars.sql"));
  await later(() => apply(ROLL, "../rollback/0029_down.sql"));
  await later(() => check(ROLL, "50_rollback_0029_test.sql"));
  await later(() => apply(ROLL, "../migrations/0029_store_inbox_assign_games_avatars.sql")); // re-apply after rollback
  // 0030 round trip.
  await later(() => apply(ROLL, "../migrations/0030_store_inbox_attention_filters.sql"));
  await later(() => apply(ROLL, "../rollback/0030_down.sql"));
  await later(() => check(ROLL, "51_rollback_0030_test.sql"));
  await later(() => apply(ROLL, "../migrations/0030_store_inbox_attention_filters.sql")); // re-apply after rollback
  // 0031 round trip.
  await later(() => apply(ROLL, "../migrations/0031_store_inquiry_payment_details.sql"));
  await later(() => apply(ROLL, "../rollback/0031_down.sql"));
  await later(() => check(ROLL, "52_rollback_0031_test.sql"));
  await later(() => apply(ROLL, "../migrations/0031_store_inquiry_payment_details.sql")); // re-apply after rollback
  // 0032 round trip.
  await later(() => apply(ROLL, "../migrations/0032_store_message_reactions_and_replies.sql"));
  await later(() => apply(ROLL, "../rollback/0032_down.sql"));
  await later(() => check(ROLL, "53_rollback_0032_test.sql"));
  await later(() => apply(ROLL, "../migrations/0032_store_message_reactions_and_replies.sql")); // re-apply after rollback
  // 0033 round trip: clean while nothing is unified, refused afterwards.
  await later(() => apply(ROLL, "../migrations/0033_store_unified_customer_thread.sql"));
  await later(() => apply(ROLL, "../rollback/0033_down.sql"));
  await later(() => check(ROLL, "54_rollback_0033_test.sql"));
  await later(() => apply(ROLL, "../migrations/0033_store_unified_customer_thread.sql")); // re-apply after rollback
  await later(() => withDb(ROLL, (c) => c.query(`insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
      buyer_name, buyer_roblox_username, total_amount) values ('BW-ROLL33', 'idem-roll33-0033-xxxxxxx', repeat('5', 64), repeat('5', 64), 'R', 'r', 10);
    select store_attach_order_to_customer('BW-ROLL33', '00000000-0000-0000-0000-0000000000c2', 'SLIP', 'R', null)`)));
  await later(() => expectFailure(ROLL, "../rollback/0033_down.sql", "0033 rollback refuses once an order joined a customer conversation"));
  // 0034 round trip: clean before a vouch, refused after one is sent.
  await later(() => apply(ROLL, "../migrations/0034_store_vouch_requests.sql"));
  await later(() => apply(ROLL, "../rollback/0034_down.sql"));
  await later(() => check(ROLL, "55_rollback_0034_test.sql"));
  await later(() => apply(ROLL, "../migrations/0034_store_vouch_requests.sql"));
  await later(() => withDb(ROLL, (c) => c.query("select store_send_vouch_request('BW-AAAAAA', '00000000-0000-0000-0000-0000000000a1')")));
  await later(() => expectFailure(ROLL, "../rollback/0034_down.sql", "0034 rollback refuses once a vouch request exists"));

  // ---- Database 3: order-chat regression. 0026 is in place BEFORE the
  // existing order-chat suites run, so every order behaviour they check
  // (fulfillment, Done/Reopen, albums, uploads, realtime topics, paging,
  // public usernames) is proven unchanged by 0026.
  await later(async () => {
    await freshBase(REGR);
    for (const name of [
      "../migrations/0022_store_order_fulfillment_details.sql",
      "../migrations/0024_store_conversation_workflow_and_albums.sql",
      "../migrations/0025_store_admin_public_usernames.sql",
      "../migrations/0026_store_general_inquiries.sql",
      "../migrations/0027_store_payment_received.sql",
      "../migrations/0028_store_inbox_reply_state.sql",
      "../migrations/0029_store_inbox_assign_games_avatars.sql",
      "../migrations/0030_store_inbox_attention_filters.sql",
      "../migrations/0031_store_inquiry_payment_details.sql",
      "../migrations/0032_store_message_reactions_and_replies.sql",
      "../migrations/0033_store_unified_customer_thread.sql",
      "../migrations/0034_store_vouch_requests.sql",
      "../migrations/0035_store_historical_chat_links.sql",
      "../migrations/0036_store_historical_chat_compatibility.sql",
    ]) await apply(REGR, name);
    await check(REGR, "25_fulfillment_test.sql");
    await check(REGR, "26_workflow_albums_test.sql");
    await check(REGR, "27_public_usernames_test.sql");
  });
}

try {
  await run();
} catch (error) {
  failures += 1;
  console.log(error.message);
} finally {
  await admin(`drop database if exists ${MAIN}`).catch(() => undefined);
  await admin(`drop database if exists ${ROLL}`).catch(() => undefined);
  await admin(`drop database if exists ${REGR}`).catch(() => undefined);
}
if (failures) {
  console.log(`\n${failures} database test failure(s)`);
  process.exit(1);
}
console.log("\nAll database tests passed");
