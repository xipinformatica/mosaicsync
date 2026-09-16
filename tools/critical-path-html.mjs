export function maskRawTextElementContents(source) {
  return String(source).replace(
    /(<\s*(script|style)\b[^>]*>)([\s\S]*?)(<\s*\/\s*\2\s*>)/gi,
    (_match, open, _tag, content, close) => `${open}${content.replace(/[^\r\n]/g, " ")}${close}`
  );
}
