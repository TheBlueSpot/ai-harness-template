import { Buffer } from "node:buffer";

type ZipEntryInput = {
  name: string;
  content: string | Uint8Array;
};

const CRC32_TABLE = buildCrc32Table();

export function createSamplePdfBuffer() {
  return createPdfDocument([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    ["<< /Length 43 >>", "stream", "BT", "/F1 18 Tf", "72 96 Td", "(Hello PDF extraction) Tj", "ET", "endstream"].join("\n"),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ]);
}

export function createScanOnlyPdfBuffer() {
  return createPdfDocument([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>",
    ["<< /Length 24 >>", "stream", "0 0 100 100 re", "f", "endstream"].join("\n")
  ]);
}

export function createSampleDocxBuffer() {
  return createStoredZip([
    {
      name: "word/document.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        "  <w:body>",
        "    <w:p><w:r><w:t>Docx intro</w:t></w:r></w:p>",
        "    <w:tbl>",
        "      <w:tr>",
        "        <w:tc><w:p><w:r><w:t>Cell A1</w:t></w:r></w:p></w:tc>",
        "        <w:tc><w:p><w:r><w:t>Cell B1</w:t></w:r></w:p></w:tc>",
        "      </w:tr>",
        "    </w:tbl>",
        "  </w:body>",
        "</w:document>"
      ].join("\n")
    }
  ]);
}

export function createSampleXlsxBuffer() {
  return createStoredZip([
    {
      name: "xl/workbook.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        "  <sheets>",
        '    <sheet name="Backlog" sheetId="1" r:id="rId1" />',
        "  </sheets>",
        "</workbook>"
      ].join("\n")
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" />',
        "</Relationships>"
      ].join("\n")
    },
    {
      name: "xl/sharedStrings.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">',
        "  <si><t>Task</t></si>",
        "  <si><t>Ship docs</t></si>",
        "</sst>"
      ].join("\n")
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        "  <sheetData>",
        '    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
        "  </sheetData>",
        "</worksheet>"
      ].join("\n")
    }
  ]);
}

export function createSamplePptxBuffer() {
  return createStoredZip([
    {
      name: "ppt/presentation.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        "  <p:sldIdLst>",
        '    <p:sldId id="256" r:id="rId1" />',
        "  </p:sldIdLst>",
        "</p:presentation>"
      ].join("\n")
    },
    {
      name: "ppt/_rels/presentation.xml.rels",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml" />',
        "</Relationships>"
      ].join("\n")
    },
    {
      name: "ppt/slides/slide1.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
        "  <p:cSld>",
        "    <p:spTree>",
        "      <p:sp><p:txBody><a:p><a:r><a:t>Slide heading</a:t></a:r></a:p></p:txBody></p:sp>",
        "      <p:sp><p:txBody><a:p><a:r><a:t>Follow-up bullet</a:t></a:r></a:p></p:txBody></p:sp>",
        "    </p:spTree>",
        "  </p:cSld>",
        "</p:sld>"
      ].join("\n")
    }
  ]);
}

export function createSampleOdtBuffer() {
  return createStoredZip([
    {
      name: "content.xml",
      content: [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">',
        "  <office:body>",
        "    <office:text>",
        "      <text:h>ODT heading</text:h>",
        "      <text:p>ODT paragraph</text:p>",
        "      <text:list>",
        "        <text:list-item><text:p>First item</text:p></text:list-item>",
        "      </text:list>",
        "      <table:table>",
        "        <table:table-row>",
        "          <table:table-cell><text:p>Table A1</text:p></table:table-cell>",
        "          <table:table-cell><text:p>Table B1</text:p></table:table-cell>",
        "        </table:table-row>",
        "      </table:table>",
        "    </office:text>",
        "  </office:body>",
        "</office:document-content>"
      ].join("\n")
    }
  ]);
}

export function createDataUrl(mimeType: string, buffer: Buffer) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function createStoredZip(entries: ZipEntryInput[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name);
    const dataBuffer = typeof entry.content === "string" ? Buffer.from(entry.content, "utf8") : Buffer.from(entry.content);
    const crc = crc32(dataBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

function createPdfDocument(objectBodies: string[]) {
  const objects = objectBodies.map((body, index) => `${index + 1} 0 obj\n${body}\nendobj\n`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const objectText of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += objectText;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = CRC32_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}
