import DOMPurify from 'dompurify';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// O conteúdo das notas é sempre armazenado em Markdown.
// O modo Rich converte Markdown → HTML ao abrir e HTML → Markdown ao salvar.

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  br: '\n',
});
turndown.use(gfm);

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string;
  return sanitizeHtml(html);
}

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(sanitizeHtml(html)).trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Migração de notas antigas ────────────────────────────────────────────────
// Versões anteriores gravavam o texto de exemplo do modo Rich como conteúdo
// real e salvavam HTML no mesmo campo usado pelos modos Texto e Markdown.
const LEGACY_RICH_PLACEHOLDER = 'Escreva em modo visual rico (cole imagens, negrito, etc)...';
const HTML_TAG_PATTERN = /<\/?(p|div|br|em|strong|b|i|u|s|span|img|ul|ol|li|h[1-6]|a|blockquote|pre|code|font)\b[^>]*>/i;

export function migrateLegacyContent(raw: string): { content: string; changed: boolean } {
  let next = raw.split(LEGACY_RICH_PLACEHOLDER).join('');
  next = next.replace(/<em>\s*<\/em>/gi, '');

  if (HTML_TAG_PATTERN.test(next)) {
    next = htmlToMarkdown(next);
  }

  next = next.trim() === '' ? '' : next;
  return { content: next, changed: next !== raw };
}
