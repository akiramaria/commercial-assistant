import Anthropic from '@anthropic-ai/sdk';
import JSZip from 'jszip';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Shared by every feature that calls Claude: the client, turning files into content blocks,
// loading skills, and asking for a structured (JSON schema) answer.

const MODEL = 'claude-opus-5-5';

export type Block = Anthropic.Beta.BetaContentBlockParam;

/** An error whose message is safe to show to the person, with the HTTP status to send. */
export class AIError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AIError('Add your ANTHROPIC_API_KEY to the .env file in the project folder, then restart the server.', 503);
  }
  if (/\s/.test(apiKey)) {
    throw new AIError('ANTHROPIC_API_KEY has a line break or space in it. Put only the key on that line, then restart the server.', 503);
  }
  // Keys that aren't scoped to a workspace must name one on every request.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  // Use only this project's settings. Without authToken: null and an explicit baseURL, the SDK would also
  // pick up ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL inherited from whatever launched the server.
  return new Anthropic({
    apiKey,
    authToken: null,
    baseURL: 'https://api.anthropic.com',
    ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
  });
}

// skills/ sits at the project root here, and beside the bundled function on Vercel.
const SKILLS_DIR = [join(import.meta.dirname, 'skills'), join(import.meta.dirname, '..', 'skills')].find(existsSync) ?? '';

/** A skill's SKILL.md without its frontmatter, plus any reference files beside it. Read per request so edits apply at once. */
export function loadSkill(name: string): { text: string; refs: string[] } {
  const dir = join(SKILLS_DIR, name);
  const skill = readFileSync(join(dir, 'SKILL.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
  const refsDir = join(dir, 'references');
  const refs = existsSync(refsDir) ? readdirSync(refsDir).filter((f) => f.endsWith('.md')).sort() : [];
  const parts = [skill.trim()];
  for (const f of refs) parts.push(`<reference file="references/${f}">\n${readFileSync(join(refsDir, f), 'utf8').trim()}\n</reference>`);
  return { text: parts.join('\n\n'), refs };
}

const TEXT_TYPES = /^text\/|^application\/(json|markdown)$/;
const xmlText = (xml: string) =>
  xml
    .replace(/<\/(w:p|a:p)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** The text of a .docx or .pptx file (both are zipped XML). Slides are numbered so Claude can cite them. */
async function officeText(name: string, data: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  if (/\.docx$/i.test(name)) {
    const doc = zip.file('word/document.xml');
    return doc ? xmlText(await doc.async('string')) : '';
  }
  const slides = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const texts = await Promise.all(slides.map(async (f, i) => `[Slide ${i + 1}]\n${xmlText(await zip.file(f)!.async('string'))}`));
  return texts.join('\n\n');
}

/** Turns a file into a content block Claude can read: PDFs as documents; text, Word and PowerPoint as text. */
export async function fileBlock(name: string, mime: string, data: Buffer, tag = 'source'): Promise<Block> {
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
    return { type: 'document', title: name, source: { type: 'base64', media_type: 'application/pdf', data: data.toString('base64') } };
  }
  if (TEXT_TYPES.test(mime) || /\.(txt|md)$/i.test(name)) {
    return { type: 'text', text: `<${tag} file="${name}">\n${data.toString('utf8')}\n</${tag}>` };
  }
  if (/\.(docx|pptx)$/i.test(name)) {
    let text = '';
    try {
      text = await officeText(name, data);
    } catch {
      throw new AIError(`“${name}” couldn’t be opened. Save it again as .docx, .pptx or PDF and re-upload it.`);
    }
    return { type: 'text', text: `<${tag} file="${name}">\n${text || '(no text found in this file)'}\n</${tag}>` };
  }
  throw new AIError(`“${name}” can’t be read here. Use a PDF, Word (.docx), PowerPoint (.pptx) or text file.`);
}

/** Asks Claude for an answer matching `schema` and returns it parsed. */
export async function askClaude<T>({
  system,
  content,
  schema,
  tooLong = 'The answer was too long to finish. Try again with fewer sources.',
}: {
  system: string;
  content: Block[];
  schema: Record<string, unknown>;
  tooLong?: string;
}): Promise<T> {
  const stream = client().beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: [{ type: 'text', text: system }],
    messages: [{ role: 'user', content }],
  });

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AIError('The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.', 503);
    if (e instanceof Anthropic.RateLimitError) throw new AIError('Claude is busy right now. Try again in a minute.', 503);
    if (e instanceof Anthropic.BadRequestError) throw new AIError(`Claude couldn’t read the request: ${e.message}`, 400);
    if (e instanceof Anthropic.APIError) throw new AIError(`Claude returned an error (${e.status ?? 'network'}). Try again.`, 502);
    throw e;
  }

  if (message.stop_reason === 'refusal') throw new AIError('Claude declined to process this.', 502);
  if (message.stop_reason === 'max_tokens') throw new AIError(tooLong, 502);
  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AIError('Claude’s answer couldn’t be read. Try again.', 502);
  }
}

// Helpers for strict JSON schemas: every property required, no extras.
export const str = { type: 'string' };
export const strs = { type: 'array', items: str };
export const int = { type: 'integer' };
export const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const arr = (items: unknown) => ({ type: 'array', items });
