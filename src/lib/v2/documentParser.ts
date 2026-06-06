import { parsePlaybookFile, type ParseResult } from "@/lib/playbooks/parser";

export async function parseV2AccountDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ParseResult> {
  return parsePlaybookFile(buffer, mimeType, fileName);
}
