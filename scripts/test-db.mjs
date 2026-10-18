// Database tests without psql (e.g. Windows + a portable PostgreSQL such as
// embedded-postgres). Same sequence as scripts/test-db.sh, plus 0025/0026.
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
  // The repository's own sequence also covers a database where 0023 ran
  // (throwaway local database only; production never runs 0023 here).
  await apply(MAIN, "../migrations/0023_store_chat_legacy_cleanup.sql");
  await check(MAIN, "30_cleanup_test.sql");
  // 0024, 0025 and 0026 still apply cleanly on top of 0023.
  await apply(MAIN, "../migrations/0024_store_conversation_workflow_and_albums.sql");
  await later(() => apply(MAIN, "../migrations/0025_store_admin_public_usernames.sql"));
  await later(() => apply(MAIN, "../migrations/0026_store_general_inquiries.sql"));

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
