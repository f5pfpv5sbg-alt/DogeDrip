import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");

function section(startMarker, endMarker) {
  const start = worker.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = worker.indexOf(endMarker, start);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return worker.slice(start, end);
}

test("API accepts only canonical HTTPS production or one-level Pages preview origins", () => {
  const origin = section("function isAllowedOrigin(origin)", "const REF_ALPHABET");
  assert.match(origin, /url\.origin === origin/);
  assert.match(origin, /!url\.username/);
  assert.match(origin, /!url\.password/);
  assert.match(origin, /url\.protocol === "https:"/);
  assert.match(origin, /url\.hostname\.endsWith\("\.dogedrip\.pages\.dev"\)/);
  assert.match(origin, /url\.hostname\.split\("\."\)\.length === 4/);
  assert.match(origin, /url\.port === ""/);
});

test("JSON body parser rejects unsupported media types before opening the body stream", () => {
  const parser = section("async function readJson(request)", "function generateRefCode()");
  assert.match(parser, /Content-Type/);
  assert.match(parser, /contentType !== "application\\/json"/);
  assert.match(parser, /new HttpError\\(415,/);
  assert.ok(parser.indexOf("contentType !==") < parser.indexOf("request.body?.getReader()"));
});

test("JSON body parser enforces the byte limit while streaming even without Content-Length", () => {
  const parser = section("async function readJson(request)", "function generateRefCode()");
  assert.match(parser, /MAX_REQUEST_BODY_BYTES/);
  assert.match(parser, /request\\.body\\?\\.getReader\\(\\)/);
  assert.match(parser, /totalBytes > MAX_REQUEST_BODY_BYTES/);
  assert.match(parser, /reader\\.cancel\\(\\)/);
  assert.match(parser, /new HttpError\\(413,/);
  assert.doesNotMatch(parser, /request\\.text\\(\\)/);
});

test("scheduled cleanup owns stale-row cleanup instead of adding random writes to user requests", () => {
  const limiter = section("async function enforceRateLimit", "async function readJson");
  const sync = section('if (path === "/api/auth/sync" && method === "POST")', 'if (path === "/api/activity/heartbeat"');
  const scheduled = section("async scheduled(controller, env, ctx)", "async fetch(request, env)");
  assert.doesNotMatch(limiter, /Math\.random|DELETE FROM api_rate_limits/);
  assert.doesNotMatch(sync, /Math\.random|DELETE FROM user_daily_activity/);
  assert.match(scheduled, /DELETE FROM api_rate_limits/);
  assert.match(scheduled, /DELETE FROM user_daily_activity/);
});

test("unsupported HTTP methods receive 405 and an explicit Allow header", () => {
  const entry = section("async fetch(request, env)", "\n  }\n};");
  assert.match(entry, /!\["GET", "POST", "PUT"\]\.includes\(request\.method\)/);
  assert.match(entry, /status: 405/);
  assert.match(entry, /"Allow": "GET, POST, PUT, OPTIONS"/);
  assert.ok(entry.indexOf('request.method === "OPTIONS"') < entry.indexOf('!["GET", "POST", "PUT"]'));
});
