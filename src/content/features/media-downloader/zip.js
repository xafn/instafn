/**
 * Minimal ZIP writer (STORE / no compression) + the "download carousel as .zip"
 * flow.
 *
 * Instagram media is already compressed (JPEG/MP4), so deflate would buy almost
 * nothing — a STORE archive is tiny to implement and produces a perfectly valid
 * .zip. Building the archive needs the raw bytes in the page, which means
 * cross-origin fetches to *.cdninstagram.com / *.fbcdn.net; those hosts are in
 * the extension's host_permissions, so the content script can fetch them without
 * tripping CORS. The finished archive is a same-origin blob: URL, so a plain
 * <a download> saves it.
 */

import { buildFilename, getEmbedMetadata } from "./downloader.js";
import { showToast, CHECK_ICON } from "../../ui/toast.js";
import { embedMetadataInJpeg, isEmptyMetadata } from "./metadata.js";

// ---- CRC-32 (required by the ZIP format) ----------------------------------
let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}
function crc32(buf) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- little-endian helpers ------------------------------------------------
const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n) =>
  new Uint8Array([
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ]);
function concat(arrs) {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

// DOS date for 1980-01-01 (a stable, valid timestamp; ZIP needs *something*).
const DOS_TIME = u16(0);
const DOS_DATE = u16(0x21);
const UTF8_FLAG = 0x0800; // filenames are UTF-8

/** Build a STORE-method .zip Blob from [{ name, data: Uint8Array }]. */
export function makeZipBlob(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const localHeader = concat([
      u32(0x04034b50), // local file header signature
      u16(20), // version needed
      u16(UTF8_FLAG), // general purpose flag
      u16(0), // compression: store
      DOS_TIME,
      DOS_DATE,
      u32(crc),
      u32(size), // compressed size
      u32(size), // uncompressed size
      u16(name.length),
      u16(0), // extra length
      name,
    ]);
    parts.push(localHeader, f.data);

    central.push(
      concat([
        u32(0x02014b50), // central directory header signature
        u16(20), // version made by
        u16(20), // version needed
        u16(UTF8_FLAG),
        u16(0), // compression: store
        DOS_TIME,
        DOS_DATE,
        u32(crc),
        u32(size),
        u32(size),
        u16(name.length),
        u16(0), // extra
        u16(0), // comment
        u16(0), // disk number start
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset), // local header offset
        name,
      ])
    );

    offset += localHeader.length + size;
  }

  const centralBytes = concat(central);
  const eocd = concat([
    u32(0x06054b50), // end of central directory signature
    u16(0), // disk number
    u16(0), // disk with central dir
    u16(files.length), // entries on this disk
    u16(files.length), // total entries
    u32(centralBytes.length),
    u32(offset), // central dir offset
    u16(0), // comment length
  ]);

  return new Blob([...parts, centralBytes, eocd], { type: "application/zip" });
}

function anchorDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

function zipBaseName(media) {
  const bits = [];
  if (media?.username) bits.push(media.username.replace(/[^a-z0-9._-]+/gi, "_"));
  if (media?.code && media.code !== "profile") bits.push(media.code);
  return bits.join("_") || "instagram";
}

/**
 * Fetch every media in `list`, pack them into a .zip and save it. Reports
 * partial failures (e.g. a single item that wouldn't fetch) rather than aborting.
 */
export async function buildZipDownload(list) {
  if (!list || !list.length) return;
  showToast(`Zipping ${list.length} items…`, { duration: 2000 });

  const embed = await getEmbedMetadata();

  const files = [];
  let failed = 0;
  for (const m of list) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetch(m.url, { credentials: "omit" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      // eslint-disable-next-line no-await-in-loop
      let buf = new Uint8Array(await resp.arrayBuffer());

      // Bake metadata into JPEGs; keep the raw bytes if it's not a JPEG/video.
      if (embed && m.type === "image" && m.metadata && !isEmptyMetadata(m.metadata)) {
        const injected = embedMetadataInJpeg(buf, m.metadata);
        if (injected) buf = injected;
      }
      files.push({ name: buildFilename(m), data: buf });
    } catch (_) {
      failed++;
    }
  }

  if (!files.length) {
    showToast("Couldn't fetch the media to zip.", { duration: 2800 });
    return;
  }

  let blob;
  try {
    blob = makeZipBlob(files);
  } catch (err) {
    showToast(`Zip failed: ${err.message || err}`, { duration: 2800 });
    return;
  }

  const url = URL.createObjectURL(blob);
  anchorDownload(url, `${zipBaseName(list[0])}.zip`);
  setTimeout(() => URL.revokeObjectURL(url), 15000);

  showToast(
    failed
      ? `Zipped ${files.length}/${list.length} (${failed} failed)`
      : `Zipped ${files.length} items`,
    { duration: 2600, icon: CHECK_ICON }
  );
}
