import DOMPurify from "dompurify";

/**
 * 富文本 HTML 消毒：所有进入 dangerouslySetInnerHTML / Quill 粘贴的
 * 服务端或用户内容必须先经过此函数，防止存储型 XSS。
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}
