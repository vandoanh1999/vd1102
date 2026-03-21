export function sse() {
  const enc = new TextEncoder();
  const ts = new TransformStream();
  const w = ts.writable.getWriter();
  return {
    stream: ts.readable,
    send(obj: unknown) { w.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); },
    close() { w.close(); },
  };
}
