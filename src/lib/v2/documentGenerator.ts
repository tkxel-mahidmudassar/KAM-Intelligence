import { randomUUID } from "crypto";
import JSZip from "jszip";
import { complete } from "@/lib/ai";
import type { V2CammieAccountContext } from "@/lib/v2/cammieAgent";
import { v2AgentBehaviorPrompt } from "@/lib/v2/agentBehavior";

export interface V2DocumentGenerationInput {
  documentType: string;
  userRequest: string;
  role: string;
  activeAccount?: V2CammieAccountContext | null;
  accounts: V2CammieAccountContext[];
  attachments?: Array<{
    fileName: string;
    type: string;
    preview?: string;
    extractedText?: string;
    parseError?: string;
  }>;
  templates?: Array<{
    name: string;
    tag: string;
    format: string;
  }>;
  conversation: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface V2GeneratedDocument {
  title: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  format: "DOCX" | "PPTX" | "PDF" | "XLSX" | "Markdown";
  summary: string;
}

type GeneratedFormat = V2GeneratedDocument["format"];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "document";
}

function parseJson(content: string): { title?: string; summary?: string; markdown?: string } {
  const raw = content.replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

function hasUnresolvedPlaceholder(markdown: string) {
  return /\b(to be confirmed|to be decided|tbd|unknown|not known|not available|missing information)\b/i.test(markdown);
}

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function inferFormat(input: V2DocumentGenerationInput): GeneratedFormat {
  const text = `${input.documentType} ${input.userRequest}`.toLowerCase();
  if (/\b(markdown|\.md|md file)\b/.test(text)) return "Markdown";
  if (/\b(xlsx|excel|spreadsheet|workbook|\.xls|\.xlsx)\b/.test(text)) return "XLSX";
  if (/\b(pptx|ppt|powerpoint|slide deck|slides|presentation|deck|qbr)\b/.test(text)) return "PPTX";
  if (/\b(pdf|\.pdf)\b/.test(text)) return "PDF";
  return "DOCX";
}

function extensionForFormat(format: GeneratedFormat) {
  if (format === "PPTX") return "pptx";
  if (format === "PDF") return "pdf";
  if (format === "XLSX") return "xlsx";
  if (format === "Markdown") return "md";
  return "docx";
}

function mimeForFormat(format: GeneratedFormat) {
  if (format === "PPTX") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (format === "XLSX") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (format === "PDF") return "application/pdf";
  if (format === "Markdown") return "text/markdown;charset=utf-8";
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

async function buildXlsx(markdown: string, title: string) {
  const rows = plainTextFromMarkdown(markdown).map((line) => [line]);
  const zip = new JSZip();
  const sheetRows = [[title], ...rows].map((row, rowIndex) => {
    const cells = row.map((cell, cellIndex) => {
      const column = String.fromCharCode(65 + cellIndex);
      return `<c r="${column}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>Kamazing T Man</dc:creator>
  <cp:lastModifiedBy>Kamazing T Man</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Kamazing</Application>
</Properties>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Generated Document" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols><col min="1" max="1" width="110" customWidth="1"/></cols>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function dataUrl(buffer: Buffer | Uint8Array | string, format: GeneratedFormat) {
  const bytes = typeof buffer === "string" ? Buffer.from(buffer, "utf-8") : Buffer.from(buffer);
  return `data:${mimeForFormat(format)};base64,${bytes.toString("base64")}`;
}

function markdownLines(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function plainTextFromMarkdown(markdown: string) {
  return markdownLines(markdown)
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*]\s+/, "• ")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)"),
    );
}

function wrapText(value: string, maxLength: number) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
      return;
    }
    current = next;
  });
  if (current) lines.push(current);
  return lines;
}

function docxParagraph(line: string) {
  const headingLevel = line.match(/^(#{1,3})\s+(.*)$/);
  const bullet = line.match(/^[-*]\s+(.*)$/);
  const text = headingLevel?.[2] ?? bullet?.[1] ?? line;
  const size = headingLevel ? (headingLevel[1].length === 1 ? 36 : 28) : 22;
  const bold = headingLevel || /^\*\*.*\*\*$/.test(text);
  const bulletProps = bullet ? '<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>' : "";
  return `<w:p>${bulletProps}<w:r><w:rPr><w:sz w:val="${size}"/>${bold ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${escapeXml(bullet ? `• ${text}` : text.replace(/\*\*/g, ""))}</w:t></w:r></w:p>`;
}

async function buildDocx(markdown: string, title: string) {
  const zip = new JSZip();
  const paragraphs = markdownLines(markdown).map(docxParagraph).join("");
  const createdAt = new Date().toISOString();

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>Kamazing T Man</dc:creator>
  <cp:lastModifiedBy>Kamazing T Man</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Kamazing</Application>
</Properties>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr>
  </w:body>
</w:document>`);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function markdownSections(markdown: string, fallbackTitle: string): Array<{ title: string; bullets: string[]; notes: string }> {
  const lines = markdownLines(markdown);
  const sections: Array<{ title: string; bullets: string[]; notes: string }> = [];
  let current: { title: string; bullets: string[]; notes: string[] } | null = null;

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      if (current) {
        sections.push({ title: current.title, bullets: current.bullets, notes: current.notes.join(" ") });
      }
      current = { title: heading[1].slice(0, 80), bullets: [], notes: [] };
      continue;
    }
    if (!current) current = { title: fallbackTitle, bullets: [], notes: [] };
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      current.bullets.push(bullet[1].slice(0, 160));
    } else {
      current.notes.push(line.replace(/\*\*/g, ""));
    }
  }

  if (current) {
    sections.push({ title: current.title, bullets: current.bullets, notes: current.notes.join(" ") });
  }

  const usable = sections
    .filter((section) => section.title)
    .map((section) => ({
      title: section.title,
      bullets: (section.bullets.length ? section.bullets : wrapText(section.notes, 95)).slice(0, 5),
      notes: section.notes || section.bullets.join(" "),
    }))
    .slice(0, 12);

  return usable.length ? usable : [{ title: fallbackTitle, bullets: plainTextFromMarkdown(markdown).slice(0, 5), notes: plainTextFromMarkdown(markdown).join(" ") }];
}

function slideXml(section: { title: string; bullets: string[] }) {
  const bulletRuns = section.bullets
    .map(
      (bullet) => `
        <a:p>
          <a:pPr marL="457200" indent="-228600"><a:buChar char="•"/></a:pPr>
          <a:r><a:rPr lang="en-US" sz="2200"/><a:t>${escapeXml(bullet)}</a:t></a:r>
        </a:p>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="520000" y="390000"/><a:ext cx="8120000" cy="780000"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3700" b="1"/><a:t>${escapeXml(section.title)}</a:t></a:r></a:p></p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="700000" y="1300000"/><a:ext cx="7900000" cy="4100000"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/>${bulletRuns}</p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function notesSlideXml(notes: string, index: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder ${index}"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="685800" y="3886200"/><a:ext cx="8229600" cy="2946400"/></a:xfrm></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>${escapeXml(notes.slice(0, 1200))}</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:notes>`;
}

async function buildPptx(markdown: string, title: string) {
  const slides = markdownSections(markdown, title);
  const zip = new JSZip();
  const slideOverrides = slides
    .map((_, index) => {
      const slideNumber = index + 1;
      return `<Override PartName="/ppt/slides/slide${slideNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide${slideNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`;
    })
    .join("\n  ");

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideOverrides}
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>Kamazing T Man</dc:creator>
  <cp:lastModifiedBy>Kamazing T Man</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Kamazing</Application>
  <Slides>${slides.length}</Slides>
  <Notes>${slides.length}</Notes>
</Properties>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("")}</p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("\n  ")}
</Relationships>`);
  zip.file("ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`);
  zip.file("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="titleAndBody">
  <p:cSld name="Title and Body"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);
  zip.file("ppt/notesMasters/notesMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
</p:notesMaster>`);
  zip.file("ppt/theme/theme1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Kamazing"><a:themeElements><a:clrScheme name="Kamazing"><a:dk1><a:srgbClr val="1F2722"/></a:dk1><a:lt1><a:srgbClr val="FFF9EF"/></a:lt1><a:dk2><a:srgbClr val="25352E"/></a:dk2><a:lt2><a:srgbClr val="FBF7EF"/></a:lt2><a:accent1><a:srgbClr val="25352E"/></a:accent1><a:accent2><a:srgbClr val="7FB99A"/></a:accent2><a:accent3><a:srgbClr val="D8CAB9"/></a:accent3><a:accent4><a:srgbClr val="D7A24A"/></a:accent4><a:accent5><a:srgbClr val="D66A5B"/></a:accent5><a:accent6><a:srgbClr val="6F6254"/></a:accent6><a:hlink><a:srgbClr val="25352E"/></a:hlink><a:folHlink><a:srgbClr val="6F6254"/></a:folHlink></a:clrScheme><a:fontScheme name="Kamazing"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="Kamazing"><a:fillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);

  slides.forEach((slide, index) => {
    const slideNumber = index + 1;
    zip.file(`ppt/slides/slide${slideNumber}.xml`, slideXml(slide));
    zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${slideNumber}.xml"/></Relationships>`);
    zip.file(`ppt/notesSlides/notesSlide${slideNumber}.xml`, notesSlideXml(slide.notes, slideNumber));
    zip.file(`ppt/notesSlides/_rels/notesSlide${slideNumber}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${slideNumber}.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/></Relationships>`);
  });

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function buildPdf(markdown: string, title: string) {
  const lines = [title, "", ...plainTextFromMarkdown(markdown)].flatMap((line) => wrapText(line, 86));
  const pageLineLimit = 42;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += pageLineLimit) {
    pages.push(lines.slice(index, index + pageLineLimit));
  }
  if (pages.length === 0) pages.push([title]);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
    const streamLines = pageLines
      .map((line, lineIndex) => {
        const font = index === 0 && lineIndex === 0 ? "/F2 20 Tf" : "/F1 10.5 Tf";
        const y = 742 - lineIndex * 16;
        return `BT ${font} 54 ${y} Td (${escapePdfText(line)}) Tj ET`;
      })
      .join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(streamLines, "utf-8")} >>\nstream\n${streamLines}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf-8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf-8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf-8");
}

async function buildArtifact(markdown: string, title: string, format: GeneratedFormat) {
  if (format === "Markdown") return Buffer.from(markdown, "utf-8");
  if (format === "PPTX") return buildPptx(markdown, title);
  if (format === "PDF") return buildPdf(markdown, title);
  if (format === "XLSX") return buildXlsx(markdown, title);
  return buildDocx(markdown, title);
}

async function completeDocument(input: V2DocumentGenerationInput, cleanupMarkdown?: string) {
  const requestedFormat = inferFormat(input);
  return complete({
    task: cleanupMarkdown ? "v2-cammie-document-generator-cleanup" : "v2-cammie-document-generator",
    jsonMode: true,
    temperature: cleanupMarkdown ? 0.1 : 0.18,
    maxTokens: 3200,
    messages: [
      {
        role: "system",
        content:
          "You are a V2 Tkxel KAM document generation agent. Generate the exact business document the user requests using only supplied account, attachment, conversation, and portfolio context. Return valid JSON only. Do not invent facts. Do not include placeholder phrases such as To be confirmed, TBD, unknown, not known, or to be decided.",
      },
      {
        role: "user",
        content: `${cleanupMarkdown ? "Rewrite this draft to remove unresolved placeholder language while keeping the document complete. If a non-essential section lacks evidence, omit that section instead of writing a placeholder.\n\nDraft to clean:\n" + cleanupMarkdown + "\n\n" : "Generate this document.\n\n"}
Requested document type:
${input.documentType}

Requested output format:
${requestedFormat}

User request:
${input.userRequest}

Role:
${input.role}

Active account:
${JSON.stringify(input.activeAccount ?? null, null, 2)}

Visible portfolio accounts:
${JSON.stringify(input.accounts.slice(0, 30), null, 2)}

Attached documents:
${JSON.stringify((input.attachments ?? []).slice(0, 5), null, 2)}

Available templates:
${JSON.stringify((input.templates ?? []).slice(0, 10), null, 2)}

Recent conversation:
${JSON.stringify(input.conversation.slice(-8), null, 2)}

Return JSON:
{
  "title": "document title",
  "summary": "one sentence describing what was generated",
  "markdown": "complete Markdown document"
}

Rules:
${v2AgentBehaviorPrompt}

Document-specific rules:
- Support any reasonable KAM/account-management document type, including QBR, KYC, account brief, executive update, renewal plan, risk memo, meeting brief, escalation note, action plan, stakeholder map, onboarding brief, and follow-up email.
- Do not include any placeholder sections or placeholder phrases.
- If the user asks for an email, write it as a send-ready email draft with subject, recipients if known, and body.
- If the user asks for slides or a PPTX, structure the Markdown with one heading per slide and concise bullets beneath it. Put speaker notes as normal paragraphs below the bullets.
- If the user asks for XLSX or Excel, structure the Markdown as clean rows or sections that can be converted into a workbook.
- If a template matches the requested document type, follow the template's document type and filename as structure/style guidance while keeping all facts grounded in account context.
- If attached documents are supplied, use their extracted text/preview as evidence and cite the attachment name inline where relevant.
- Use concise headings and practical account-management language.
- Keep the output grounded in supplied account and portfolio context.`,
      },
    ],
  });
}

export async function generateV2Document(input: V2DocumentGenerationInput): Promise<V2GeneratedDocument> {
  const response = await completeDocument(input);
  let parsed = parseJson(response.content);
  const title = String(parsed.title || `${input.documentType} draft`).slice(0, 100);
  let markdown = String(parsed.markdown || `# ${title}\n\nNo content was returned.`);
  if (hasUnresolvedPlaceholder(markdown)) {
    const cleanup = await completeDocument(input, markdown);
    parsed = parseJson(cleanup.content);
    markdown = String(parsed.markdown || markdown);
  }
  if (hasUnresolvedPlaceholder(markdown)) {
    throw new Error("T Man needs more input before generating a complete document without placeholders.");
  }
  const summary = String(parsed.summary || `Generated ${input.documentType}.`).slice(0, 180);
  const format = inferFormat(input);
  const artifact = await buildArtifact(markdown, title, format);
  const fileName = `${slugify(title)}-${randomUUID().slice(0, 8)}.${extensionForFormat(format)}`;

  return {
    title,
    documentType: input.documentType,
    fileName,
    fileUrl: dataUrl(artifact, format),
    format,
    summary,
  };
}
