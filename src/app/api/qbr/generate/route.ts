import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { complete } from "@/lib/ai";

export const runtime = "nodejs";

type QbrSlide = {
  title: string;
  bullets: string[];
  notes: string;
};

type QbrRequest = {
  account: {
    name: string;
    healthScore: number;
    arr: string;
    renewalDate: string;
    industry: string;
    location: string;
    owner: string;
  };
  prompt: {
    audience: string;
    period: string;
    goals: string;
    risks: string;
    asks: string;
  };
  documents: Array<{
    name: string;
    type: string;
    affected: string;
    status: string;
  }>;
  proposals: Array<{
    sourceDocument: string;
    field: string;
    currentValue: string;
    proposedValue: string;
    status: string;
    associateReason?: string;
    kamReason?: string;
    latestReason?: string;
  }>;
};

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseJson(content: string): { slides?: QbrSlide[] } {
  const raw = content.replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

async function buildSlides(input: QbrRequest): Promise<QbrSlide[]> {
  const response = await complete({
    task: "qbr-ppt-builder",
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 2600,
    messages: [
      {
        role: "system",
        content:
          "You are a QBR builder agent for Tkxel account management. Generate client-ready PPT slide content with concise bullets and detailed speaker notes. Use only the provided account data, uploaded document metadata, proposed updates, and user prompts. Return valid JSON only.",
      },
      {
        role: "user",
        content: `Create a QBR deck for this account.

Account:
${JSON.stringify(input.account, null, 2)}

QBR prompt:
${JSON.stringify(input.prompt, null, 2)}

Uploaded documents:
${JSON.stringify(input.documents, null, 2)}

Document-derived proposed account updates:
${JSON.stringify(input.proposals, null, 2)}

Return JSON:
{
  "slides": [
    {
      "title": "short slide title",
      "bullets": ["3-5 concise client-ready bullets"],
      "notes": "speaker notes for the presenter, 80-140 words, explicitly referencing relevant account data and uploaded documents where applicable"
    }
  ]
}

Rules:
- Produce 6 to 8 slides.
- Include an executive summary, account health, progress/value delivered, document-backed updates, risks, next quarter plan, and decisions/asks.
- Do not invent metrics beyond the provided values.
- If data is missing, say what must be confirmed in speaker notes rather than fabricating it.`,
      },
    ],
  });

  const parsed = parseJson(response.content);
  const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
  const validSlides = slides
    .filter((slide) => slide?.title && Array.isArray(slide.bullets) && slide.notes)
    .slice(0, 8)
    .map((slide) => ({
      title: String(slide.title).slice(0, 90),
      bullets: slide.bullets.map((bullet) => String(bullet).slice(0, 180)).slice(0, 5),
      notes: String(slide.notes).slice(0, 1200),
    }));

  if (validSlides.length < 3) {
    throw new Error("OpenAI did not return enough valid QBR slides");
  }

  return validSlides;
}

function slideXml(slide: QbrSlide) {
  const bulletRuns = slide.bullets
    .map(
      (bullet, index) => `
        <a:p>
          <a:pPr marL="457200" indent="-228600"><a:buChar char="•"/></a:pPr>
          <a:r><a:rPr lang="en-US" sz="2200"/><a:t>${escapeXml(bullet)}</a:t></a:r>
        </a:p>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="548640" y="420000"/><a:ext cx="8046720" cy="760000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3800" b="1"/><a:t>${escapeXml(slide.title)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="700000" y="1350000"/><a:ext cx="7900000" cy="4300000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/>${bulletRuns}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function notesSlideXml(slide: QbrSlide, index: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder ${index}"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="3886200"/><a:ext cx="8229600" cy="2946400"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1600"/><a:t>${escapeXml(slide.notes)}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:notes>`;
}

function slideRels(index: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${index}.xml"/>
</Relationships>`;
}

function notesRels(index: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${index}.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>
</Relationships>`;
}

async function buildPptx(slides: QbrSlide[]) {
  const zip = new JSZip();

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
  ${slides
    .map(
      (_, index) => `
  <Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`,
    )
    .join("")}
</Types>`);

  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>DotKAM QBR</dc:title>
  <dc:creator>DotKAM</dc:creator>
  <cp:lastModifiedBy>DotKAM</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>DotKAM</Application>
  <Slides>${slides.length}</Slides>
  <Notes>${slides.length}</Notes>
</Properties>`);

  const slideIds = slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideIds}</p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("")}
</Relationships>`,
  );

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
  zip.file("ppt/theme/theme1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="KAM"><a:themeElements><a:clrScheme name="KAM"><a:dk1><a:srgbClr val="1F2722"/></a:dk1><a:lt1><a:srgbClr val="FFF9EF"/></a:lt1><a:dk2><a:srgbClr val="25352E"/></a:dk2><a:lt2><a:srgbClr val="FBF7EF"/></a:lt2><a:accent1><a:srgbClr val="25352E"/></a:accent1><a:accent2><a:srgbClr val="7FB99A"/></a:accent2><a:accent3><a:srgbClr val="D8CAB9"/></a:accent3><a:accent4><a:srgbClr val="D7A24A"/></a:accent4><a:accent5><a:srgbClr val="D66A5B"/></a:accent5><a:accent6><a:srgbClr val="6F6254"/></a:accent6><a:hlink><a:srgbClr val="25352E"/></a:hlink><a:folHlink><a:srgbClr val="6F6254"/></a:folHlink></a:clrScheme><a:fontScheme name="KAM"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme><a:fmtScheme name="KAM"><a:fillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);

  slides.forEach((slide, index) => {
    const slideNumber = index + 1;
    zip.file(`ppt/slides/slide${slideNumber}.xml`, slideXml(slide));
    zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`, slideRels(slideNumber));
    zip.file(`ppt/notesSlides/notesSlide${slideNumber}.xml`, notesSlideXml(slide, slideNumber));
    zip.file(`ppt/notesSlides/_rels/notesSlide${slideNumber}.xml.rels`, notesRels(slideNumber));
  });

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function POST(req: NextRequest) {
  try {
    const input = (await req.json()) as QbrRequest;
    if (!input.account?.name || !input.prompt?.audience || !input.prompt?.period || !input.prompt?.goals) {
      return NextResponse.json({ error: "Missing required QBR inputs" }, { status: 400 });
    }

    const slides = await buildSlides(input);
    const pptx = await buildPptx(slides);
    const fileName = `${input.account.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "account"}-QBR.pptx`;

    return new NextResponse(pptx as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "QBR generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
