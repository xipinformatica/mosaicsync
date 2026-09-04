/* Read a response body without allowing an undeclared oversized payload to be
 * buffered in full. The caller owns fetch policy and timeout cancellation. */
export async function readBoundedResponseBlob(response, maxBytes) {
  const limit = Number(maxBytes);
  if (!response || !Number.isFinite(limit) || limit < 0) throw new TypeError("Invalid bounded response input");
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("Remote image is too large.");
  const contentType = String(response.headers?.get?.("content-type") || "");

  const reader = response.body?.getReader?.();
  if (!reader) {
    const blob = await response.blob();
    if (blob.size > limit) throw new Error("Remote image is too large.");
    return contentType && blob.type !== contentType ? new Blob([blob], { type: contentType }) : blob;
  }

  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
      total += chunk.byteLength;
      if (total > limit) {
        await reader.cancel("Remote image is too large.").catch(() => {});
        throw new Error("Remote image is too large.");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock?.();
  }
  return new Blob(chunks, contentType ? { type: contentType } : undefined);
}
