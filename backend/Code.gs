// Afleysingavaktin — bakendi (Google Apps Script web app)
// Geymir sameiginlega stöðu síðunnar (frí, pottur, afleysingar) í Script Properties.
// doGet  -> {state, version}
// doPost -> tekur {state, baseVersion}; skilar {ok, version} eða {conflict, state, version}

var KEY_PREFIX = "vaktin_state_";
var META_KEY = "vaktin_meta";
var CHUNK = 8000; // Script Properties þola ~9KB á gildi

function readState_() {
  var props = PropertiesService.getScriptProperties();
  var meta = props.getProperty(META_KEY);
  if (!meta) return { state: { absences: [], manual: [], covers: {} }, version: 0 };
  meta = JSON.parse(meta);
  var s = "";
  for (var i = 0; i < meta.chunks; i++) s += props.getProperty(KEY_PREFIX + i) || "";
  return { state: JSON.parse(s), version: meta.version };
}

function writeState_(state, version) {
  var props = PropertiesService.getScriptProperties();
  var s = JSON.stringify(state);
  if (s.length > 400000) throw new Error("state too large");
  var chunks = Math.max(1, Math.ceil(s.length / CHUNK));
  for (var i = 0; i < chunks; i++) props.setProperty(KEY_PREFIX + i, s.substr(i * CHUNK, CHUNK));
  var old = props.getProperty(META_KEY);
  if (old) {
    old = JSON.parse(old);
    for (var j = chunks; j < old.chunks; j++) props.deleteProperty(KEY_PREFIX + j);
  }
  props.setProperty(META_KEY, JSON.stringify({ version: version, chunks: chunks }));
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return out_(readState_());
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || typeof body.baseVersion !== "number" || !body.state) return out_({ error: "bad request" });
    var cur = readState_();
    if (body.baseVersion !== cur.version) return out_({ conflict: true, state: cur.state, version: cur.version });
    var next = cur.version + 1;
    writeState_(body.state, next);
    return out_({ ok: true, version: next });
  } catch (err) {
    return out_({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
