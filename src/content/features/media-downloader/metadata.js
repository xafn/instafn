/**
 * Post metadata extraction + embedding.
 *
 * Everything here is derived from the SAME `/api/v1/media/<id>/info/` response
 * the downloader already fetches to resolve the highest-quality renditions — no
 * extra network requests. `resolveMediaById` / `resolveByShortcode` keep the raw
 * API item around long enough for `extractMetadata` to pluck the descriptive
 * fields, which then travel with each download descriptor as `media.metadata`.
 *
 * Photos get the metadata baked straight into the file — a binary EXIF/TIFF APP1
 * (date, GPS, caption, creator — what Finder/Explorer/Photos read) plus an XMP
 * packet (keywords, alt text, post link, location name). No sidecar files. The
 * embedded source URL is always the POST permalink, never the image CDN URL.
 * Videos aren't rewritten in-browser (would need MP4 container surgery), so they
 * download without embedded metadata for now.
 */

// ---------------------------------------------------------------------------
// Extraction — raw API item → normalized metadata
// ---------------------------------------------------------------------------

// Pull #hashtags out of a caption, deduped, in first-seen order, '#'-stripped.
function hashtagsFromCaption(text) {
  if (!text) return [];
  const out = [];
  const seen = new Set();
  const re = /#([\p{L}\p{N}_]+)/gu;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[1];
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

function locationFrom(item) {
  const loc = item?.location;
  if (!loc) return null;
  const name = loc.name || loc.short_name || "";
  const lat = typeof loc.lat === "number" ? loc.lat : null;
  const lng = typeof loc.lng === "number" ? loc.lng : null;
  if (!name && lat == null && lng == null) return null;
  return {
    name,
    city: loc.city || "",
    address: loc.address || "",
    lat,
    lng,
  };
}

/**
 * Build a normalized metadata object from the top-level API `item` (caption,
 * user, location, date all live there) and, for carousels, the per-slide
 * `child` (which carries its own alt text). `code`/index info comes from the
 * descriptor meta the caller already computed.
 */
export function extractMetadata(item, child, extra = {}) {
  if (!item) return null;
  const node = child || item;
  const captionText = item.caption?.text || "";
  const code = item.code || extra.code || "";
  const username = item.user?.username || extra.username || "";
  const takenAtSec = node.taken_at || item.taken_at || item.caption?.created_at;
  const takenAt = takenAtSec ? new Date(takenAtSec * 1000).toISOString() : "";

  return {
    altText: node.accessibility_caption || item.accessibility_caption || "",
    caption: captionText,
    creator: item.user?.full_name || "",
    username,
    location: locationFrom(item),
    takenAt,
    code,
    link: code ? `https://www.instagram.com/p/${code}/` : "",
    keywords: hashtagsFromCaption(captionText),
  };
}

/** Metadata for a profile picture (no post — link points at the profile). */
export function profileMetadata(username, fullName) {
  if (!username) return null;
  return {
    altText: "",
    caption: "",
    creator: fullName || "",
    username,
    location: null,
    takenAt: "",
    code: "profile",
    link: `https://www.instagram.com/${username}/`,
    keywords: [],
  };
}

function isEmptyMetadata(meta) {
  if (!meta) return true;
  return (
    !meta.altText &&
    !meta.caption &&
    !meta.creator &&
    !meta.link &&
    !meta.takenAt &&
    !meta.location &&
    (!meta.keywords || !meta.keywords.length)
  );
}

// ---------------------------------------------------------------------------
// XMP packet
// ---------------------------------------------------------------------------

function xmlEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// XMP/EXIF GPS coordinate: "deg,min.decN" (degrees integer, minutes decimal,
// hemisphere ref). This is the exif:GPSLatitude/Longitude string form most
// readers (incl. exiftool) accept.
function toXmpGps(value, posRef, negRef) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${deg},${min.toFixed(6)}${value >= 0 ? posRef : negRef}`;
}

/**
 * Render the metadata as an XMP packet (XML). Maps onto standard Dublin Core /
 * IPTC / Photoshop / EXIF schemas so generic tools surface the fields, and also
 * mirrors everything under a private `instafn:` namespace for a clean round-trip.
 */
export function buildXmpPacket(meta) {
  const props = [];

  // dc:description ← the post caption (what photo viewers show as "Description").
  if (meta.caption) {
    props.push(
      `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(
        meta.caption
      )}</rdf:li></rdf:Alt></dc:description>`
    );
  }
  // The accessibility alt text → exif:UserComment + IPTC alt-text accessibility.
  if (meta.altText) {
    props.push(
      `<exif:UserComment><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(
        meta.altText
      )}</rdf:li></rdf:Alt></exif:UserComment>`
    );
    props.push(
      `<Iptc4xmpCore:AltTextAccessibility><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(
        meta.altText
      )}</rdf:li></rdf:Alt></Iptc4xmpCore:AltTextAccessibility>`
    );
  }
  if (meta.creator) {
    props.push(
      `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(
        meta.creator
      )}</rdf:li></rdf:Seq></dc:creator>`
    );
  }
  if (meta.keywords && meta.keywords.length) {
    const items = meta.keywords
      .map((k) => `<rdf:li>${xmlEscape(k)}</rdf:li>`)
      .join("");
    props.push(`<dc:subject><rdf:Bag>${items}</rdf:Bag></dc:subject>`);
  }
  if (meta.takenAt) {
    const localDate = localIsoString(meta.takenAt);
    props.push(`<xmp:CreateDate>${xmlEscape(localDate)}</xmp:CreateDate>`);
    props.push(
      `<photoshop:DateCreated>${xmlEscape(localDate)}</photoshop:DateCreated>`
    );
  }
  if (meta.link) {
    props.push(`<dc:source>${xmlEscape(meta.link)}</dc:source>`);
    props.push(`<photoshop:Source>${xmlEscape(meta.link)}</photoshop:Source>`);
  }
  if (meta.location) {
    if (meta.location.name) {
      props.push(
        `<Iptc4xmpCore:Location>${xmlEscape(
          meta.location.name
        )}</Iptc4xmpCore:Location>`
      );
    }
    if (meta.location.city) {
      props.push(
        `<photoshop:City>${xmlEscape(meta.location.city)}</photoshop:City>`
      );
    }
    const lat = toXmpGps(meta.location.lat, "N", "S");
    const lng = toXmpGps(meta.location.lng, "E", "W");
    if (lat) props.push(`<exif:GPSLatitude>${lat}</exif:GPSLatitude>`);
    if (lng) props.push(`<exif:GPSLongitude>${lng}</exif:GPSLongitude>`);
  }

  // Private namespace — verbatim fields, so re-importing is lossless.
  const ifn = [];
  if (meta.username) ifn.push(`instafn:username="${xmlEscape(meta.username)}"`);
  if (meta.code) ifn.push(`instafn:shortcode="${xmlEscape(meta.code)}"`);
  if (meta.link) ifn.push(`instafn:link="${xmlEscape(meta.link)}"`);
  if (meta.altText) ifn.push(`instafn:altText="${xmlEscape(meta.altText)}"`);

  const desc =
    `<rdf:Description rdf:about=""` +
    ` xmlns:dc="http://purl.org/dc/elements/1.1/"` +
    ` xmlns:xmp="http://ns.adobe.com/xap/1.0/"` +
    ` xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"` +
    ` xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/"` +
    ` xmlns:exif="http://ns.adobe.com/exif/1.0/"` +
    ` xmlns:instafn="https://instafn.local/ns/1.0/"` +
    (ifn.length ? " " + ifn.join(" ") : "") +
    `>${props.join("")}</rdf:Description>`;

  return (
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    desc +
    `</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  );
}

// ---------------------------------------------------------------------------
// Binary EXIF (APP1)
//
// XMP stores dates/coords as ISO/text strings — that's the XMP spec, but most
// OS file browsers and photo apps read the *binary* EXIF tags for "Date taken"
// and the map pin. So we also emit a real little-endian EXIF/TIFF block:
//   IFD0:   ImageDescription (caption), DateTime, Artist (creator),
//           + ExifIFD pointer, + GPS IFD pointer
//   ExifIFD: DateTimeOriginal, DateTimeDigitized   ("YYYY:MM:DD HH:MM:SS")
//   GPS IFD: lat/lng as RATIONAL[3] (deg, min, sec) with N/S, E/W refs
// ---------------------------------------------------------------------------

const T_BYTE = 1;
const T_ASCII = 2;
const T_LONG = 4;
const T_RATIONAL = 5;

function u8concat(chunks) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Uint8Array(n);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function le32(n) {
  const o = new Uint8Array(4);
  new DataView(o.buffer).setUint32(0, n >>> 0, true);
  return o;
}

// Null-terminated ASCII (EXIF ASCII type); non-ASCII chars degrade to '?'.
function asciiBytes(str) {
  const s = String(str == null ? "" : str);
  const arr = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    arr.push(c < 0x80 ? c : 0x3f);
  }
  arr.push(0);
  return new Uint8Array(arr);
}

// `taken_at` is a UTC epoch. EXIF DateTimeOriginal is conventionally *local*
// wall-clock with no tz field — we don't know the creator's zone, so we render
// it in the viewer's local timezone (matching how Instagram itself displays the
// post time) and record the offset separately via exifOffsetString() /
// OffsetTime* tags, so the absolute instant is never ambiguous. No timezone is
// hardcoded — it comes from the runtime environment.
function exifDateString(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

// Viewer-local UTC offset for `iso`, EXIF/ISO form ("+01:00" / "-05:00").
// getTimezoneOffset() is minutes *behind* UTC (negative when ahead), and it
// honours DST for that specific date.
function exifOffsetString(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  const sign = off <= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const p = (n) => String(n).padStart(2, "0");
  return `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

// Full local ISO 8601 with offset (e.g. "2024-03-12T11:40:00+01:00") — the
// correct XMP/human representation of the same instant. Falls back to the raw
// UTC string if parsing fails.
function localIsoString(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "";
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    exifOffsetString(iso)
  );
}

// One GPS coordinate as 3 LE RATIONALs: deg/1, min/1, sec*10000/10000 (24 bytes).
function gpsCoordBytes(value) {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minF = (abs - deg) * 60;
  const min = Math.floor(minF);
  const secNum = Math.round((minF - min) * 60 * 10000);
  const out = new Uint8Array(24);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, deg, true);
  dv.setUint32(4, 1, true);
  dv.setUint32(8, min, true);
  dv.setUint32(12, 1, true);
  dv.setUint32(16, secNum, true);
  dv.setUint32(20, 10000, true);
  return out;
}

const entry = (tag, type, count, value) => ({ tag, type, count, value });

// Total bytes an entry list spills into its IFD's data area (values > 4 bytes,
// word-aligned to even length). Inline values (≤4 bytes) live in the table.
function ifdExtraLen(entries) {
  return entries.reduce((s, e) => {
    const L = e.value.length;
    return s + (L > 4 ? L + (L % 2) : 0);
  }, 0);
}

// Serialize one IFD (table + its data area) at absolute `ifdOffset` in the TIFF.
function serializeIfd(entries, ifdOffset, nextIfdOffset = 0) {
  const sorted = entries.slice().sort((a, b) => a.tag - b.tag); // ascending tags
  const n = sorted.length;
  const tableSize = 2 + 12 * n + 4;
  const table = new Uint8Array(tableSize);
  const dv = new DataView(table.buffer);
  dv.setUint16(0, n, true);
  let dataCursor = ifdOffset + tableSize;
  const dataChunks = [];
  let p = 2;
  for (const e of sorted) {
    dv.setUint16(p, e.tag, true);
    dv.setUint16(p + 2, e.type, true);
    dv.setUint32(p + 4, e.count, true);
    const v = e.value;
    if (v.length <= 4) {
      for (let i = 0; i < v.length; i++) table[p + 8 + i] = v[i];
    } else {
      dv.setUint32(p + 8, dataCursor, true);
      dataChunks.push(v);
      dataCursor += v.length;
      if (v.length % 2 === 1) {
        dataChunks.push(new Uint8Array([0])); // word-align
        dataCursor++;
      }
    }
    p += 12;
  }
  dv.setUint32(2 + 12 * n, nextIfdOffset, true);
  return u8concat([table, u8concat(dataChunks)]);
}

/** Build a complete EXIF APP1 segment for `meta`, or null if there's nothing. */
export function buildExifApp1(meta) {
  if (!meta) return null;
  const date = exifDateString(meta.takenAt);
  const hasGps =
    meta.location &&
    typeof meta.location.lat === "number" &&
    typeof meta.location.lng === "number";
  if (!date && !hasGps && !meta.caption && !meta.creator) return null;

  const exifEntries = [];
  if (date) {
    const db = asciiBytes(date);
    exifEntries.push(entry(0x9003, T_ASCII, db.length, db)); // DateTimeOriginal
    exifEntries.push(entry(0x9004, T_ASCII, db.length, db)); // DateTimeDigitized
    const offset = exifOffsetString(meta.takenAt); // e.g. "+01:00"
    if (offset) {
      const ob = asciiBytes(offset);
      exifEntries.push(entry(0x9010, T_ASCII, ob.length, ob)); // OffsetTime
      exifEntries.push(entry(0x9011, T_ASCII, ob.length, ob)); // OffsetTimeOriginal
      exifEntries.push(entry(0x9012, T_ASCII, ob.length, ob)); // OffsetTimeDigitized
    }
  }

  const gpsEntries = [];
  if (hasGps) {
    gpsEntries.push(entry(0x0000, T_BYTE, 4, new Uint8Array([2, 3, 0, 0])));
    gpsEntries.push(
      entry(0x0001, T_ASCII, 2, asciiBytes(meta.location.lat >= 0 ? "N" : "S"))
    );
    gpsEntries.push(entry(0x0002, T_RATIONAL, 3, gpsCoordBytes(meta.location.lat)));
    gpsEntries.push(
      entry(0x0003, T_ASCII, 2, asciiBytes(meta.location.lng >= 0 ? "E" : "W"))
    );
    gpsEntries.push(entry(0x0004, T_RATIONAL, 3, gpsCoordBytes(meta.location.lng)));
  }

  const ifd0Entries = [];
  if (meta.caption) {
    const b = asciiBytes(meta.caption);
    ifd0Entries.push(entry(0x010e, T_ASCII, b.length, b)); // ImageDescription
  }
  if (date) {
    const b = asciiBytes(date);
    ifd0Entries.push(entry(0x0132, T_ASCII, b.length, b)); // DateTime
  }
  if (meta.creator) {
    const b = asciiBytes(meta.creator);
    ifd0Entries.push(entry(0x013b, T_ASCII, b.length, b)); // Artist
  }

  // Lay out IFDs sequentially (TIFF header is 8 bytes, IFD0 starts at offset 8).
  // Pointer-entry VALUES are inline 4-byte offsets, so IFD0's size is known from
  // its entry count + extra data alone — independent of those offsets.
  const hasExif = exifEntries.length > 0;
  const hasGpsIfd = gpsEntries.length > 0;
  const n0 = ifd0Entries.length + (hasExif ? 1 : 0) + (hasGpsIfd ? 1 : 0);
  const ifd0Size = 2 + 12 * n0 + 4 + ifdExtraLen(ifd0Entries);
  const exifOffset = 8 + ifd0Size;
  const exifSize = hasExif
    ? 2 + 12 * exifEntries.length + 4 + ifdExtraLen(exifEntries)
    : 0;
  const gpsOffset = exifOffset + exifSize;

  if (hasExif) ifd0Entries.push(entry(0x8769, T_LONG, 1, le32(exifOffset)));
  if (hasGpsIfd) ifd0Entries.push(entry(0x8825, T_LONG, 1, le32(gpsOffset)));

  const ifd0 = serializeIfd(ifd0Entries, 8, 0);
  const exifIfd = hasExif ? serializeIfd(exifEntries, exifOffset, 0) : new Uint8Array(0);
  const gpsIfd = hasGpsIfd ? serializeIfd(gpsEntries, gpsOffset, 0) : new Uint8Array(0);

  const header = new Uint8Array(8);
  const hdv = new DataView(header.buffer);
  header[0] = 0x49; // "II" little-endian
  header[1] = 0x49;
  hdv.setUint16(2, 0x002a, true);
  hdv.setUint32(4, 8, true); // IFD0 offset
  const tiff = u8concat([header, ifd0, exifIfd, gpsIfd]);

  const payload = u8concat([
    new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]), // "Exif\0\0"
    tiff,
  ]);
  const segLen = 2 + payload.length;
  if (segLen > 0xffff) return null;
  const seg = new Uint8Array(2 + segLen);
  seg[0] = 0xff;
  seg[1] = 0xe1; // APP1
  seg[2] = (segLen >> 8) & 0xff;
  seg[3] = segLen & 0xff;
  seg.set(payload, 4);
  return seg;
}

// ---------------------------------------------------------------------------
// JPEG embedding
// ---------------------------------------------------------------------------

const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";

// Wrap an XMP packet in its APP1 segment, or null if it won't fit one segment.
function buildXmpApp1(xmpXml) {
  const enc = new TextEncoder();
  const headerBytes = enc.encode(XMP_HEADER);
  const xmpBytes = enc.encode(xmpXml);
  const segLen = 2 + headerBytes.length + xmpBytes.length;
  if (segLen > 0xffff) return null;
  const seg = new Uint8Array(2 + segLen);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  seg[2] = (segLen >> 8) & 0xff;
  seg[3] = segLen & 0xff;
  seg.set(headerBytes, 4);
  seg.set(xmpBytes, 4 + headerBytes.length);
  return seg;
}

/**
 * Embed `meta` into JPEG `bytes`: a binary EXIF APP1 (date/GPS/caption/creator —
 * what OS file browsers and photo apps read) followed by an XMP APP1 (keywords,
 * alt text, link, location name). Both go right after SOI, EXIF first (readers
 * expect the Exif APP1 first). Returns a new Uint8Array, or null if the bytes
 * aren't a JPEG (e.g. webp) or there's nothing to embed — caller saves untouched.
 */
export function embedMetadataInJpeg(bytes, meta) {
  if (!bytes || bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null; // not a JPEG (SOI = FF D8)
  }
  if (!meta) return null;

  const segs = [];
  const exif = buildExifApp1(meta);
  if (exif) segs.push(exif);
  const xmp = buildXmpApp1(buildXmpPacket(meta));
  if (xmp) segs.push(xmp);
  if (!segs.length) return null;

  const insert = u8concat(segs);
  const out = new Uint8Array(bytes.length + insert.length);
  out.set(bytes.subarray(0, 2), 0);
  out.set(insert, 2);
  out.set(bytes.subarray(2), 2 + insert.length);
  return out;
}

// ---------------------------------------------------------------------------
// Ogg (Opus / Vorbis) comment embedding — for DM voice notes (.ogg)
//
// A voice note can't take JPEG EXIF, so the in-file equivalent is the format's
// native comment header: OpusTags (Ogg/Opus) or the Vorbis comment packet. We
// rewrite *only* the comment-header page in place — same page sequence number,
// recomputed lacing + Ogg CRC — and bail (return null → caller saves the
// original untouched) on anything unusual, so a download is never corrupted.
// ---------------------------------------------------------------------------

// Ogg's CRC32: polynomial 0x04c11db7, init 0, NO bit reflection, no final xor.
// (Different from the zip/PNG CRC, which is reflected.)
let OGG_CRC_TABLE = null;
function oggCrcTable() {
  if (OGG_CRC_TABLE) return OGG_CRC_TABLE;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = (i << 24) >>> 0;
    for (let j = 0; j < 8; j++) {
      r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    }
    t[i] = r >>> 0;
  }
  OGG_CRC_TABLE = t;
  return t;
}
function oggCrc(page) {
  const t = oggCrcTable();
  let crc = 0;
  for (let i = 0; i < page.length; i++) {
    crc = ((crc << 8) ^ t[((crc >>> 24) ^ page[i]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

function u32le(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function pushU32le(arr, v) {
  arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}
function asciiAt(b, o, s) {
  for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false;
  return true;
}

// Reassemble one Ogg page (recomputes lacing + CRC). Returns null if the payload
// would need more than one page (>255 lacing segments) — never our small tags.
function buildOggPage(headerType, granule8, serial, seq, payload) {
  const lacing = [];
  let rem = payload.length;
  while (rem >= 255) {
    lacing.push(255);
    rem -= 255;
  }
  lacing.push(rem);
  if (lacing.length > 255) return null;

  const page = new Uint8Array(27 + lacing.length + payload.length);
  page[0] = 0x4f; page[1] = 0x67; page[2] = 0x67; page[3] = 0x53; // "OggS"
  page[4] = 0; // stream structure version
  page[5] = headerType;
  page.set(granule8, 6); // granule position (8 bytes)
  page[14] = serial & 0xff; page[15] = (serial >>> 8) & 0xff;
  page[16] = (serial >>> 16) & 0xff; page[17] = (serial >>> 24) & 0xff;
  page[18] = seq & 0xff; page[19] = (seq >>> 8) & 0xff;
  page[20] = (seq >>> 16) & 0xff; page[21] = (seq >>> 24) & 0xff;
  // CRC (22..25) left zero while computing.
  page[26] = lacing.length;
  for (let i = 0; i < lacing.length; i++) page[27 + i] = lacing[i];
  page.set(payload, 27 + lacing.length);

  const crc = oggCrc(page);
  page[22] = crc & 0xff; page[23] = (crc >>> 8) & 0xff;
  page[24] = (crc >>> 16) & 0xff; page[25] = (crc >>> 24) & 0xff;
  return page;
}

// Walk Ogg pages until we have the first few (enough to find the comment header).
function parseOggPages(bytes, max) {
  const pages = [];
  let o = 0;
  while (o + 27 <= bytes.length && pages.length < max) {
    if (!asciiAt(bytes, o, "OggS")) break;
    const headerType = bytes[o + 5];
    const numSeg = bytes[o + 26];
    const segStart = o + 27;
    if (segStart + numSeg > bytes.length) break;
    let payloadLen = 0;
    for (let i = 0; i < numSeg; i++) payloadLen += bytes[segStart + i];
    const payloadStart = segStart + numSeg;
    const pageEnd = payloadStart + payloadLen;
    if (pageEnd > bytes.length) break;
    pages.push({
      start: o, headerType, numSeg, lacing: bytes.subarray(segStart, segStart + numSeg),
      payloadStart, payloadLen, pageEnd,
    });
    o = pageEnd;
  }
  return pages;
}

/**
 * Embed `meta` (title/artist/date/description/link) into an Ogg/Opus or
 * Ogg/Vorbis `.ogg` as native comment tags. Returns new bytes, or null when the
 * stream isn't a clean single-packet comment header we can safely rewrite — the
 * caller then saves the original file unchanged.
 */
export function embedMetadataInOgg(bytes, meta) {
  try {
    if (!bytes || bytes.length < 28 || !asciiAt(bytes, 0, "OggS")) return null;
    if (!meta) return null;

    const pages = parseOggPages(bytes, 4);
    if (pages.length < 2) return null;

    // Find the comment-header page: Opus → payload starts "OpusTags"; Vorbis →
    // 0x03 "vorbis".
    let ci = -1, kind = null;
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (asciiAt(bytes, p.payloadStart, "OpusTags")) { ci = i; kind = "opus"; break; }
      if (bytes[p.payloadStart] === 0x03 && asciiAt(bytes, p.payloadStart + 1, "vorbis")) {
        ci = i; kind = "vorbis"; break;
      }
    }
    if (ci === -1) return null;

    const cp = pages[ci];
    // Only rewrite when this page holds exactly ONE complete packet (one lacing
    // terminator <255, as the final segment, and not continued from a prior
    // page). Anything else (comment shares a page with setup data, etc.) → bail.
    if (cp.headerType & 0x01) return null;
    let terminators = 0;
    for (let i = 0; i < cp.numSeg; i++) if (cp.lacing[i] < 255) terminators++;
    if (terminators !== 1 || cp.lacing[cp.numSeg - 1] === 255) return null;

    const payload = bytes.subarray(cp.payloadStart, cp.payloadStart + cp.payloadLen);
    const magicLen = kind === "opus" ? 8 : 7;
    let off = magicLen;
    if (off + 4 > payload.length) return null;
    const vlen = u32le(payload, off); off += 4;
    if (off + vlen + 4 > payload.length) return null;
    const vendor = payload.subarray(off, off + vlen); off += vlen;
    const count = u32le(payload, off); off += 4;

    const existing = [];
    for (let i = 0; i < count; i++) {
      if (off + 4 > payload.length) return null;
      const ln = u32le(payload, off); off += 4;
      if (off + ln > payload.length) return null;
      existing.push(payload.subarray(off, off + ln)); off += ln;
    }

    const enc = new TextEncoder();
    const ours = [];
    const add = (k, v) => { if (v) ours.push(enc.encode(`${k}=${v}`)); };
    add("TITLE", meta.title);
    add("ARTIST", meta.artist);
    add("DATE", meta.date);
    add("DESCRIPTION", meta.description);
    add("COMMENT", meta.description);
    add("CONTACT", meta.link);
    add("ORGANIZATION", "Instagram");

    // Drop any existing tags whose key we're setting, so re-runs don't duplicate.
    const ourKeys = new Set(["TITLE", "ARTIST", "DATE", "DESCRIPTION", "COMMENT", "CONTACT", "ORGANIZATION"]);
    const dec = new TextDecoder();
    const kept = existing.filter((c) => {
      const s = dec.decode(c);
      const eq = s.indexOf("=");
      const key = (eq >= 0 ? s.slice(0, eq) : s).toUpperCase();
      return !ourKeys.has(key);
    });
    const comments = kept.concat(ours);

    const out = [];
    for (let i = 0; i < magicLen; i++) out.push(payload[i]);
    pushU32le(out, vendor.length);
    for (let i = 0; i < vendor.length; i++) out.push(vendor[i]);
    pushU32le(out, comments.length);
    for (const c of comments) {
      pushU32le(out, c.length);
      for (let i = 0; i < c.length; i++) out.push(c[i]);
    }
    if (kind === "vorbis") out.push(0x01); // framing bit
    const newPayload = new Uint8Array(out);

    const granule = bytes.subarray(cp.start + 6, cp.start + 14);
    const serial = u32le(bytes, cp.start + 14);
    const seq = u32le(bytes, cp.start + 18);
    const newPage = buildOggPage(cp.headerType, granule, serial, seq, newPayload);
    if (!newPage) return null;

    const result = new Uint8Array(cp.start + newPage.length + (bytes.length - cp.pageEnd));
    result.set(bytes.subarray(0, cp.start), 0);
    result.set(newPage, cp.start);
    result.set(bytes.subarray(cp.pageEnd), cp.start + newPage.length);
    return result;
  } catch (_) {
    return null;
  }
}

export { isEmptyMetadata };
