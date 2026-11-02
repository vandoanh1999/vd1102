export function sse() {
  const enc = new TextEncoder();
  const ts = new TransformStream();
  const w = ts.writable.getWriter();
  // Người dùng đóng tab giữa chừng thì ghi tiếp sẽ lỗi → nuốt lỗi để server không sập.
  return {
    stream: ts.readable,
    send(obj: unknown) { w.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)).catch(() => {}); },
    close() { w.close().catch(() => {}); },
  };
}
