/**
 * IslamWeb Islamic Library MCP Server (Cloudflare Worker — Zero Dependencies)
 * خادم MCP للمكتبة الإسلامية على إسلام ويب (الحديث، التخريج، الشروح، التراجم)
 *
 * Endpoints:
 *   POST /mcp  (أو POST /)  -> MCP Streamable HTTP (JSON-RPC 2.0)
 *   GET  /                  -> Health & info JSON
 *   OPTIONS *               -> CORS preflight
 *
 * متوافق مع: Claude (Web/Desktop/Mobile), ChatGPT Connectors, Cursor, Antigravity, وغيرها.
 */

const SERVER_INFO = {
  name: "islamweb-library-mcp",
  version: "1.0.0",
};

const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];

const ISLAMWEB_BASE = "https://www.islamweb.net";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ar,en;q=0.8",
  Referer: "https://www.islamweb.net/ar/library/",
};

// قائمة أشهر كتب الحديث والشروح والتراجم في المكتبة الإسلامية على إسلام ويب
const COMMON_BOOKS = [
  { book_id: 0, title: "صحيح البخاري", category: "متون الحديث" },
  { book_id: 1, title: "صحيح مسلم", category: "متون الحديث" },
  { book_id: 2, title: "سنن الترمذي", category: "متون الحديث" },
  { book_id: 3, title: "سنن النسائي", category: "متون الحديث" },
  { book_id: 4, title: "سنن أبي داود", category: "متون الحديث" },
  { book_id: 5, title: "سنن ابن ماجه", category: "متون الحديث" },
  { book_id: 6, title: "مسند أحمد", category: "متون الحديث" },
  { book_id: 7, title: "موطأ مالك", category: "متون الحديث" },
  { book_id: 8, title: "سنن الدارمي", category: "متون الحديث" },
  { book_id: 71, title: "السنن الكبرى للبيهقي", category: "متون الحديث" },
  { book_id: 74, title: "مصنف عبد الرزاق", category: "متون الحديث" },
  { book_id: 1008, title: "معرفة السنن والآثار للبيهقي", category: "متون الحديث" },
  { book_id: 52, title: "فتح الباري شرح صحيح البخاري (ابن حجر)", category: "شروح الحديث" },
  { book_id: 303, title: "عمدة القاري شرح صحيح البخاري (العيني)", category: "شروح الحديث" },
  { book_id: 305, title: "التوضيح لشرح الجامع الصحيح (ابن الملقن)", category: "شروح الحديث" },
  { book_id: 53, title: "شرح النووي على صحيح مسلم", category: "شروح الحديث" },
  { book_id: 55, title: "عون المعبود شرح سنن أبي داود", category: "شروح الحديث" },
  { book_id: 56, title: "تحفة الأحوذي بشرح جامع الترمذي", category: "شروح الحديث" },
  { book_id: 78, title: "التمهيد لما في الموطأ من المعاني والأسانيد", category: "شروح الحديث" },
  { book_id: 79, title: "مرقاة المفاتيح شرح مشكاة المصابيح", category: "شروح الحديث" },
  { book_id: 80, title: "إحكام الأحكام شرح عمدة الأحكام", category: "شروح الحديث" },
  { book_id: 81, title: "جامع العلوم والحكم (ابن رجب)", category: "شروح الحديث" },
  { book_id: 304, title: "فيض القدير شرح الجامع الصغير", category: "شروح الحديث" },
  { book_id: 310, title: "طرح التثريب في شرح التقريب", category: "شروح الحديث" },
  { book_id: 60, title: "سير أعلام النبلاء (الذهبي)", category: "التراجم والرجال" },
  { book_id: 82, title: "فتح المغيث بشرح ألفية الحديث", category: "مصطلح الحديث" },
  { book_id: 88, title: "تدريب الراوي (السيوطي)", category: "مصطلح الحديث" },
  { book_id: 15, title: "المغني (ابن قدامة)", category: "الفقه" },
  { book_id: 14, title: "المجموع شرح المهذب (النووي)", category: "الفقه" },
  { book_id: 17, title: "المحلى بالآثار (ابن حزم)", category: "الفقه" },
  { book_id: 22, title: "مجموع فتاوى ابن تيمية", category: "الفتاوى والعقيدة" },
];

// ============================================================================
// أدوات تنظيف النصوص وتحليل HTML
// ============================================================================

function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function stripHiddenSpans(html) {
  // إزالة وسوم المعرفات المخفية داخل نصوص إسلام ويب مثل:
  // <span class='namesatt' style='display:none'>nindex.php?page=showalam&ids=14171</span>
  // <span class="hadithatt" style="display:none">nindex.php?page=hadith&LINKID=650001</span>
  // <span class="mainsubjatt" style='display:none'>...</span>
  // <span class="quranatt" style='display:none'>...</span>
  return html.replace(
    /<span[^>]+class\s*=\s*["'](?:namesatt|hadithatt|mainsubjatt|quranatt|subjatt)["'][^>]*>[\s\S]*?<\/span>/gi,
    ""
  );
}

function htmlToCleanText(html) {
  if (!html) return "";
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = stripHiddenSpans(s);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeHtmlEntities(s);
  // إزالة أي بقايا لنصوص nindex.php?page=... إن وجدت كنص حر
  s = s.replace(/nindex\.php\?page=[a-zA-Z0-9_=&-]+/g, "");
  s = s.replace(/[ \t\r]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} أثناء جلب الرابط: ${url}`);
  }
  return await res.text();
}

// ============================================================================
// دوال التعامل مع المكتبة الإسلامية (إسلام ويب)
// ============================================================================

async function searchLibrary({
  query,
  book_id = -1,
  match_type = "all",
  page = 1,
  limit = 10,
}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) {
    throw new Error("يجب إدخال نص للبحث في الحقل query.");
  }

  let R1 = 7; // جميع الكلمات (الافتراضي في إسلام ويب)
  let exact = 0;
  if (match_type === "exact") {
    R1 = 1;
    exact = 1;
  } else if (match_type === "any") {
    R1 = 2;
  } else if (match_type === "root") {
    R1 = 4;
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const start = (safePage - 1) * 35;
  const safeLimit = Math.min(35, Math.max(1, parseInt(limit, 10) || 10));
  const bkNo =
    book_id === undefined || book_id === null || book_id === ""
      ? -1
      : parseInt(book_id, 10);

  const params = new URLSearchParams({
    lang: "A",
    synonym: "0",
    extended: "0",
    exact: String(exact),
    device: "0",
    generalsearch: "0",
    srchloc: "0",
    bk_no: String(Number.isNaN(bkNo) ? -1 : bkNo),
    agent: "",
    t: "",
    txt: cleanQuery,
    R1: String(R1),
    R2: "0",
  });
  if (start > 0) {
    params.set("start", String(start));
  }

  const url = `${ISLAMWEB_BASE}/ar/SearchEngine/libtab.php?${params.toString()}`;
  const html = await fetchText(url);

  // استخراج العدد الإجمالي للنتائج
  const totalMatch = html.match(/عدد النتائج:\s*([\d,]+)/);
  const totalResults = totalMatch
    ? parseInt(totalMatch[1].replace(/,/g, ""), 10)
    : 0;

  // استخراج قائمة الكتب المطابقة مع عدد النتائج في كل كتاب
  const booksSummary = [];
  const selectMatch = html.match(
    /<select[^>]+id="libfliterindex"[^>]*>([\s\S]*?)<\/select>/i
  );
  if (selectMatch) {
    const optRegex = /<option[^>]+value="(\d+)"[^>]*>([\s\S]*?)<\/option>/gi;
    let m;
    while ((m = optRegex.exec(selectMatch[1])) !== null) {
      booksSummary.push({
        book_id: parseInt(m[1], 10),
        label: htmlToCleanText(m[2]),
      });
    }
  }

  // استخراج عناصر النتائج
  const results = [];
  const ulMatch = html.match(
    /<ul[^>]+class="[^"]*search-results[^"]*"[^>]*>([\s\S]*?)<\/ul>/i
  );
  if (ulMatch) {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let li;
    while ((li = liRegex.exec(ulMatch[1])) !== null && results.length < safeLimit) {
      const block = li[1];
      const linkMatch = block.match(
        /<h5[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
      );
      if (!linkMatch) continue;

      const rawHref = decodeHtmlEntities(linkMatch[1]);
      const bookTitle = htmlToCleanText(linkMatch[2]);
      const idMatch = rawHref.match(/\/ar\/library\/content\/(\d+)\/(\d+)/i);
      const parsedBookId = idMatch ? parseInt(idMatch[1], 10) : null;
      const parsedContentId = idMatch ? parseInt(idMatch[2], 10) : null;

      const descMatch = block.match(/<div[^>]+class="desc"[^>]*>([\s\S]*?)<\/div>/i);
      const snippet = descMatch ? htmlToCleanText(descMatch[1]) : "";

      const pathMatch = block.match(
        /<div[^>]+class="book-name"[^>]*>([\s\S]*?)<\/div>/i
      );
      const breadcrumb = pathMatch ? htmlToCleanText(pathMatch[1]) : "";

      const cleanUrl =
        parsedBookId !== null && parsedContentId !== null
          ? `${ISLAMWEB_BASE}/ar/library/content/${parsedBookId}/${parsedContentId}/`
          : rawHref.startsWith("http")
            ? rawHref
            : `${ISLAMWEB_BASE}${rawHref}`;

      results.push({
        book_title: bookTitle,
        book_id: parsedBookId,
        content_id: parsedContentId,
        breadcrumb,
        snippet,
        url: cleanUrl,
      });
    }
  }

  return {
    query: cleanQuery,
    book_id: Number.isNaN(bkNo) ? -1 : bkNo,
    match_type,
    page: safePage,
    total_results: totalResults,
    returned_count: results.length,
    matching_books_top20: booksSummary.slice(0, 20),
    results,
  };
}

function extractDivById(html, idValue) {
  const markerRegex = new RegExp(
    `<div[^>]+id\\s*=\\s*['"]${idValue}['"][^>]*>`,
    "i"
  );
  const startMatch = markerRegex.exec(html);
  if (!startMatch) return null;

  const contentStart = startMatch.index + startMatch[0].length;
  // نبحث عن إغلاق هذا الـ div عبر عدّ الوسوم المتداخلة
  let depth = 1;
  const tagRegex = /<\/?div\b[^>]*>/gi;
  tagRegex.lastIndex = contentStart;
  let m;
  while ((m = tagRegex.exec(html)) !== null) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) {
        return html.slice(contentStart, m.index);
      }
    } else if (!m[0].endsWith("/>")) {
      depth++;
    }
  }
  return html.slice(contentStart, Math.min(html.length, contentStart + 40000));
}

async function readPage({ book_id, content_id, tashkeel = true }) {
  const bk = parseInt(book_id, 10);
  const cid = parseInt(content_id, 10);
  if (Number.isNaN(bk) || Number.isNaN(cid)) {
    throw new Error("يجب إدخال رقم الكتاب book_id ورقم الصفحة content_id بشكل صحيح.");
  }

  const url = `${ISLAMWEB_BASE}/ar/library/content/${bk}/${cid}/`;
  const html = await fetchText(url);

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? htmlToCleanText(titleMatch[1]) : "";

  // جلب النص المشكول أو غير المشكول
  const rawBody =
    (tashkeel ? extractDivById(html, "pagebody_thaskeel") : null) ||
    extractDivById(html, "pagebody");

  if (!rawBody) {
    throw new Error(
      `تعذّر استخراج نص الصفحة للكتاب (${bk}) والصفحة (${cid}). قد يكون الرقم غير موجود.`
    );
  }

  // استخراج الرواة/الأعلام المذكورين في الصفحة
  const narratorsMap = new Map();
  const nameRegex =
    /<span[^>]+class\s*=\s*["']names["'][^>]*>[\s\S]*?showalam&(?:amp;)?ids=(\d+)[\s\S]*?<\/span>([\s\S]*?)<\/span>/gi;
  let nm;
  while ((nm = nameRegex.exec(rawBody)) !== null) {
    const id = parseInt(nm[1], 10);
    const name = htmlToCleanText(nm[2]);
    if (name && !narratorsMap.has(id)) {
      narratorsMap.set(id, name);
    }
  }
  const narrators = Array.from(narratorsMap.entries()).map(([id, name]) => ({
    narrator_id: id,
    name,
  }));

  // استخراج معرفات تخريج الأحاديث (LINKID)
  const linkIdsSet = new Set();
  const linkRegex = /page=hadith&(?:amp;)?LINKID=(\d+)/gi;
  let lm;
  while ((lm = linkRegex.exec(rawBody)) !== null) {
    linkIdsSet.add(parseInt(lm[1], 10));
  }
  const takhrijLinkIds = Array.from(linkIdsSet);

  // استخراج قائمة الشروح المرتبطة بالحديث (إن وُجدت)
  const shurooh = [];
  const sharhSelect = html.match(
    /<select[^>]+name="shroohhadith"[^>]*>([\s\S]*?)<\/select>/i
  );
  if (sharhSelect) {
    const optRegex = /<option[^>]+value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/gi;
    let om;
    while ((om = optRegex.exec(sharhSelect[1])) !== null) {
      const val = decodeHtmlEntities(om[1]);
      const label = htmlToCleanText(om[2]);
      const bidM = val.match(/bookid=(\d+)/i);
      const idM = val.match(/[?&]id=(\d+)/i);
      if (bidM && idM) {
        shurooh.push({
          title: label,
          book_id: parseInt(bidM[1], 10),
          content_id: parseInt(idM[1], 10),
        });
      }
    }
  }

  const text = htmlToCleanText(rawBody);

  return {
    book_id: bk,
    content_id: cid,
    title: pageTitle,
    url,
    tashkeel_enabled: Boolean(tashkeel),
    text,
    takhrij_link_ids: takhrijLinkIds,
    narrators,
    related_shurooh: shurooh,
  };
}

async function getTakhrij({ link_id }) {
  const lid = parseInt(link_id, 10);
  if (Number.isNaN(lid)) {
    throw new Error("يجب إدخال معرف الحديث link_id بشكل صحيح.");
  }

  const url = `${ISLAMWEB_BASE}/ar/library/maktaba/nindex.php?page=hadith&LINKID=${lid}`;
  const html = await fetchText(url);

  // إزالة التعليقات HTML التي تكرر الروابط
  const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, "");

  const sources = [];
  let currentBook = "";
  const tokenRegex =
    /<font[^>]+color="#FF0000"[^>]*>([\s\S]*?)<\/font>|<a[^>]+href="([^"]*page=bookpopup[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = tokenRegex.exec(cleanHtml)) !== null) {
    if (m[1] !== undefined) {
      currentBook = htmlToCleanText(m[1]);
    } else if (m[2] !== undefined) {
      const href = decodeHtmlEntities(m[2]);
      const chapter = htmlToCleanText(m[3]);
      const bidM = href.match(/bookid=(\d+)/i);
      const idM = href.match(/[?&]id=(\d+)/i);
      const bnameM = href.match(/bookname=([^&]+)/i);
      const bookName =
        currentBook ||
        (bnameM ? decodeURIComponent(bnameM[1].replace(/\+/g, " ")) : "");
      const bookId = bidM ? parseInt(bidM[1], 10) : null;
      const contentId = idM ? parseInt(idM[1], 10) : null;

      sources.push({
        book_name: bookName,
        chapter,
        book_id: bookId,
        content_id: contentId,
        url:
          bookId !== null && contentId !== null
            ? `${ISLAMWEB_BASE}/ar/library/content/${bookId}/${contentId}/`
            : `${ISLAMWEB_BASE}${href}`,
      });
    }
  }

  return {
    link_id: lid,
    total_sources: sources.length,
    sources,
  };
}

async function getNarrator({ narrator_id }) {
  const nid = parseInt(narrator_id, 10);
  if (Number.isNaN(nid)) {
    throw new Error("يجب إدخال معرف الراوي narrator_id بشكل صحيح.");
  }

  const url = `${ISLAMWEB_BASE}/ar/library/maktaba/nindex.php?page=showalam&ids=${nid}`;
  const html = await fetchText(url);
  const biography = htmlToCleanText(html);

  if (!biography) {
    throw new Error(`لم يُعثر على ترجمة للراوي ذي المعرف (${nid}).`);
  }

  return {
    narrator_id: nid,
    url,
    biography,
  };
}

async function readSharh({
  book_id,
  content_id,
  offset = 0,
  max_chars = 12000,
}) {
  const bk = parseInt(book_id, 10);
  const cid = parseInt(content_id, 10);
  if (Number.isNaN(bk) || Number.isNaN(cid)) {
    throw new Error("يجب إدخال رقم كتاب الشرح book_id ورقم الموضع content_id.");
  }

  const url = `${ISLAMWEB_BASE}/ar/library/maktaba/nindex.php?sharah=1&hrline=1&page=bookpopup&flag=1&id=${cid}&bookid=${bk}&defaulttab=hadith`;
  const html = await fetchText(url);
  const fullText = htmlToCleanText(html);

  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
  const safeMax = Math.min(30000, Math.max(1000, parseInt(max_chars, 10) || 12000));
  const slice = fullText.slice(safeOffset, safeOffset + safeMax);

  return {
    book_id: bk,
    content_id: cid,
    url: `${ISLAMWEB_BASE}/ar/library/content/${bk}/${cid}/`,
    total_chars: fullText.length,
    offset: safeOffset,
    has_more: safeOffset + safeMax < fullText.length,
    next_offset:
      safeOffset + safeMax < fullText.length ? safeOffset + safeMax : null,
    text: slice,
  };
}

function listCommonBooks({ filter = "" } = {}) {
  const q = String(filter || "").trim();
  const books = q
    ? COMMON_BOOKS.filter(
        (b) => b.title.includes(q) || b.category.includes(q)
      )
    : COMMON_BOOKS;
  return {
    count: books.length,
    books,
  };
}

// ============================================================================
// تعريف أدوات MCP (Tools Schema)
// ============================================================================

const TOOLS = [
  {
    name: "search_library",
    description:
      "البحث في المكتبة الإسلامية على إسلام ويب (كتب الحديث النبوي، الشروح، التراجم، الفقه، التفسير). يُرجع عدد النتائج، وأسماء الكتب المطابقة بأرقامها (book_id)، والمقتطفات مع رقم الصفحة (content_id) لقراءتها كاملة عبر read_page.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "نص البحث بالعربية (مثل: إنما الأعمال بالنيات، أو مسألة فقهية أو اسم راوٍ).",
        },
        book_id: {
          type: "integer",
          description:
            "اختياري: رقم الكتاب لتقييد البحث فيه (مثلاً 0 لصحيح البخاري، 1 لصحيح مسلم، 52 لفتح الباري). اتركه فارغاً أو -1 للبحث في جميع الكتب.",
        },
        match_type: {
          type: "string",
          enum: ["all", "exact", "any", "root"],
          description:
            "نوع المطابقة: all (جميع الكلمات - الافتراضي)، exact (عبارة مطابقة تماماً)، any (أي كلمة)، root (البحث بالجذر).",
        },
        page: {
          type: "integer",
          description: "رقم صفحة النتائج (الافتراضي 1، كل صفحة تحوي 35 نتيجة).",
        },
        limit: {
          type: "integer",
          description: "عدد النتائج المعروضة من الصفحة (الافتراضي 10، والحد الأقصى 35).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_page",
    description:
      "قراءة نص صفحة أو حديث كامل من أي كتاب في المكتبة الإسلامية على إسلام ويب (مشكولاً أو غير مشكول)، مع استخراج معرفات الرواة (narrator_id) ومعرفات التخريج (takhrij_link_ids) وقائمة الشروح المرتبطة بالحديث.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        book_id: {
          type: "integer",
          description: "رقم الكتاب (مثل 0 لصحيح البخاري، 1 لصحيح مسلم).",
        },
        content_id: {
          type: "integer",
          description: "رقم الصفحة أو الحديث داخل الكتاب (يؤخذ من نتائج البحث أو التخريج).",
        },
        tashkeel: {
          type: "boolean",
          description: "هل يُجلب النص مشكولاً تشكيلاً كاملاً إن وُجد؟ (الافتراضي true).",
        },
      },
      required: ["book_id", "content_id"],
    },
  },
  {
    name: "get_takhrij",
    description:
      "جلب تخريج الحديث النبوي من الكتب الستة والمسانيد وكتب التخريج والشروح في إسلام ويب باستخدام معرف الحديث (link_id) المستخرج من أداة read_page.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        link_id: {
          type: "integer",
          description: "معرف الحديث (LINKID) المستخرج من حقل takhrij_link_ids في أداة read_page.",
        },
      },
      required: ["link_id"],
    },
  },
  {
    name: "get_narrator",
    description:
      "جلب ترجمة راوٍ أو عَلَم من المكتبة الإسلامية على إسلام ويب باستخدام معرف الراوي (narrator_id) المستخرج من أداة read_page.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        narrator_id: {
          type: "integer",
          description: "معرف الراوي/العلم المستخرج من حقل narrators في أداة read_page.",
        },
      },
      required: ["narrator_id"],
    },
  },
  {
    name: "read_sharh",
    description:
      "قراءة شرح حديث من أحد الشروح المرتبطة (مثل فتح الباري أو عمدة القاري أو شرح النووي) باستخدام book_id و content_id من حقل related_shurooh في أداة read_page.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        book_id: {
          type: "integer",
          description: "رقم كتاب الشرح (مثل 52 لفتح الباري).",
        },
        content_id: {
          type: "integer",
          description: "رقم موضع الشرح (يؤخذ من related_shurooh في read_page).",
        },
        offset: {
          type: "integer",
          description: "موضع البدء بالأحرف عند استكمال قراءة شرح طويل (الافتراضي 0).",
        },
        max_chars: {
          type: "integer",
          description: "الحد الأقصى للأحرف المعروضة في المرة الواحدة (الافتراضي 12000).",
        },
      },
      required: ["book_id", "content_id"],
    },
  },
  {
    name: "list_common_books",
    description:
      "عرض قائمة بأشهر كتب الحديث والشروح والتراجم وأرقامها (book_id) في المكتبة الإسلامية على إسلام ويب لاستخدامها في تقييد البحث عبر search_library.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "كلمة اختيارية لتصفية قائمة الكتب (مثل: البخاري، شروح، التراجم).",
        },
      },
    },
  },
];

async function executeTool(name, args = {}) {
  switch (name) {
    case "search_library":
      return await searchLibrary(args);
    case "read_page":
      return await readPage(args);
    case "get_takhrij":
      return await getTakhrij(args);
    case "get_narrator":
      return await getNarrator(args);
    case "read_sharh":
      return await readSharh(args);
    case "list_common_books":
      return listCommonBooks(args);
    default:
      throw new Error(`الأداة غير معروفة: ${name}`);
  }
}

// ============================================================================
// معالج بروتوكول MCP (JSON-RPC 2.0 over Streamable HTTP)
// ============================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

async function handleJsonRpcMessage(msg) {
  // الإشعارات (بدون id) لا تحتاج رد JSON-RPC
  if (msg.id === undefined || msg.id === null) {
    return null;
  }

  const { id, method, params = {} } = msg;

  try {
    if (method === "initialize") {
      const requestedVersion = params.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(
        requestedVersion
      )
        ? requestedVersion
        : SUPPORTED_PROTOCOL_VERSIONS[0];

      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: SERVER_INFO,
        },
      };
    }

    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      };
    }

    if (method === "tools/call") {
      const toolName = params.name;
      const toolArgs = params.arguments || {};
      try {
        const data = await executeTool(toolName, toolArgs);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(data, null, 2),
              },
            ],
            isError: false,
          },
        };
      } catch (toolErr) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `خطأ أثناء تنفيذ الأداة ${toolName}: ${toolErr.message}`,
              },
            ],
            isError: true,
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: err.message || "Internal server error",
      },
    };
  }
}

async function handleRequest(request) {
    const url = new URL(request.url);

    // CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // إنهاء الجلسة
    if (request.method === "DELETE") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // فحص الحالة (GET / أو GET /mcp)
    if (request.method === "GET") {
      return jsonResponse({
        status: "ok",
        server: SERVER_INFO,
        mcp_endpoint: `${url.origin}/mcp`,
        tools: TOOLS.map((t) => t.name),
      });
    }

    // طلبات MCP (POST /mcp أو POST /)
    if (request.method === "POST") {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse(
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error: Invalid JSON" },
          },
          400
        );
      }

      const sessionId =
        request.headers.get("Mcp-Session-Id") || crypto.randomUUID();
      const extraHeaders = { "Mcp-Session-Id": sessionId };

      // دعم الطلبات المجمّعة (Batch) أو الطلب المفرد
      if (Array.isArray(payload)) {
        const responses = [];
        for (const item of payload) {
          const res = await handleJsonRpcMessage(item);
          if (res !== null) responses.push(res);
        }
        if (responses.length === 0) {
          return new Response(null, {
            status: 202,
            headers: { ...CORS_HEADERS, ...extraHeaders },
          });
        }
        return jsonResponse(responses, 200, extraHeaders);
      }

      const response = await handleJsonRpcMessage(payload);
      if (response === null) {
        return new Response(null, {
          status: 202,
          headers: { ...CORS_HEADERS, ...extraHeaders },
        });
      }

      return jsonResponse(response, 200, extraHeaders);
    }

    return jsonResponse({ error: "Method Not Allowed" }, 405);
}

export async function GET(request) { return handleRequest(request); }
export async function POST(request) { return handleRequest(request); }
export async function OPTIONS(request) { return handleRequest(request); }
export async function DELETE(request) { return handleRequest(request); }
