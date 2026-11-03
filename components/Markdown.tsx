"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

export default function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      className="prose prose-invert max-w-none text-[15px] leading-7"
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
    >
      {text}
    </ReactMarkdown>
  );
}
