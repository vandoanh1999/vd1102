// Mô phỏng Monte Carlo tâm trạng NYC: chạy:  node scripts/simulate-mood.mjs
// (dịch lib/mood.ts bằng TypeScript compiler có sẵn trong node_modules rồi chạy)
import ts from "typescript";
import fs from "fs";
const src = ts.transpileModule(fs.readFileSync(new URL("../lib/mood.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} }; new Function("module", "exports", src)(m, m.exports);
const { initialMood, step, seenProbability } = m.exports;

// Kịch bản: [giây trôi qua kể từ tin trước, loại sự kiện]
const SCENARIOS = {
  "Spam alo 6 lần, cách 5 giây":            Array(6).fill([5, "pointless"]),
  "Chửi 3 câu rồi xin lỗi":                 [[10, "insult"], [10, "insult"], [10, "insult"], [20, "sweet"]],
  "Hỏi nghiêm túc 5 câu":                   Array(5).fill([30, "serious"]),
  "Chửi 3 câu, bỏ đi 30 phút, quay lại hỏi": [[10, "insult"], [10, "insult"], [10, "insult"], [1800, "serious"]],
  "Gửi lặp 1 câu 4 lần":                    Array(4).fill([8, "repeat"]),
  "Cãi lại 5 lần liên tục":                 Array(5).fill([15, "argue"]),
};

const RUNS = 2000;
for (const [name, script] of Object.entries(SCENARIOS)) {
  const sums = script.map(() => [0, 0, 0, 0]); // anger, affection, boredom, seenP
  const ends = [];
  for (let r = 0; r < RUNS; r++) {
    let t = 1_000_000_000_000;
    let s = initialMood(t);
    script.forEach(([gap, ev], i) => {
      t += gap * 1000;
      s = step(s, ev, t);
      sums[i][0] += s.z[0]; sums[i][1] += s.z[1]; sums[i][2] += s.z[2]; sums[i][3] += seenProbability(s.z, ev);
    });
    ends.push(s.z[0]);
  }
  ends.sort((a, b) => a - b);
  console.log(`\n▶ ${name}`);
  console.log("  lượt | sự kiện    | giận | thương | chán | xác suất seen");
  script.forEach(([, ev], i) => {
    const [a, f, b, p] = sums[i].map(x => x / RUNS);
    console.log(`  ${String(i + 1).padStart(4)} | ${ev.padEnd(10)} | ${String(Math.round(a * 100)).padStart(4)} | ${String(Math.round(f * 100)).padStart(6)} | ${String(Math.round(b * 100)).padStart(4)} | ${String(Math.round(p * 100)).padStart(5)}%`);
  });
  console.log(`  độ giận cuối: thấp nhất 5% = ${Math.round(ends[Math.floor(RUNS * 0.05)] * 100)}, cao nhất 5% = ${Math.round(ends[Math.floor(RUNS * 0.95)] * 100)} (độ thất thường)`);
}
