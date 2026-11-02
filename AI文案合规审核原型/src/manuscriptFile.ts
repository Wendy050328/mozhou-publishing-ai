/** 读取书稿 .txt / .docx，供新建任务导入内容简介。 */

const MAX_BYTES = 8 * 1024 * 1024

export type ManuscriptReadResult = {
  name: string
  text: string
  kind: "txt" | "docx"
}

function decodeTxt(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3))
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2))
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  }
}

function u16(view: DataView, offset: number) {
  return view.getUint16(offset, true)
}

function u32(view: DataView, offset: number) {
  return view.getUint32(offset, true)
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持解压 docx，请改用 .txt，或更换 Chromium 内核浏览器。")
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const min = Math.max(0, bytes.length - 65557)
  for (let i = bytes.length - 22; i >= min; i--) {
    if (u32(view, i) === 0x06054b50) return i
  }
  throw new Error("无法识别 docx 文件结构。")
}

async function unzipEntry(buffer: ArrayBuffer, entryName: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const eocd = findEndOfCentralDirectory(bytes)
  const totalEntries = u16(view, eocd + 10)
  let offset = u32(view, eocd + 16)
  for (let i = 0; i < totalEntries; i++) {
    if (u32(view, offset) !== 0x02014b50) {
      throw new Error("docx 中央目录损坏。")
    }
    const method = u16(view, offset + 10)
    const compSize = u32(view, offset + 20)
    const nameLen = u16(view, offset + 28)
    const extraLen = u16(view, offset + 30)
    const commentLen = u16(view, offset + 32)
    const localHeader = u32(view, offset + 42)
    const name = new TextDecoder("utf-8").decode(
      bytes.subarray(offset + 46, offset + 46 + nameLen),
    )
    if (name === entryName) {
      if (u32(view, localHeader) !== 0x04034b50) {
        throw new Error("docx 本地文件头无效。")
      }
      const localNameLen = u16(view, localHeader + 26)
      const localExtraLen = u16(view, localHeader + 28)
      const dataStart = localHeader + 30 + localNameLen + localExtraLen
      const payload = bytes.subarray(dataStart, dataStart + compSize)
      if (method === 0) return payload.slice()
      if (method === 8) return inflateRaw(payload)
      throw new Error("docx 压缩方式不受支持，请另存为较新的 .docx 或导出为 .txt。")
    }
    offset += 46 + nameLen + extraLen + commentLen
  }
  throw new Error("未在 docx 中找到正文内容（word/document.xml）。")
}

function xmlToPlainText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:drawing\b[\s\S]*?<\/w:drawing>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function readDocx(buffer: ArrayBuffer): Promise<string> {
  const xmlBytes = await unzipEntry(buffer, "word/document.xml")
  const text = xmlToPlainText(new TextDecoder("utf-8").decode(xmlBytes))
  if (!text) throw new Error("docx 正文为空。")
  return text
}

export async function readManuscriptFile(file: File): Promise<ManuscriptReadResult> {
  const name = file.name || "未命名文件"
  const lower = name.toLowerCase()
  if (file.size <= 0) throw new Error("文件为空。")
  if (file.size > MAX_BYTES) throw new Error("文件超过 8MB，请压缩或截取书稿摘要后再上传。")

  const buffer = await file.arrayBuffer()
  if (lower.endsWith(".txt")) {
    return { name, kind: "txt", text: decodeTxt(buffer).trim() }
  }
  if (lower.endsWith(".docx")) {
    return { name, kind: "docx", text: (await readDocx(buffer)).trim() }
  }
  throw new Error("仅支持 .txt 或 .docx 文件。")
}
