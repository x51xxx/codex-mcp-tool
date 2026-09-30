import { z } from 'zod';
import {
  existsSync,
  statSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  openSync,
  readSync,
  closeSync,
} from 'fs';
import { homedir } from 'os';
import { join, resolve, dirname, extname, basename, isAbsolute } from 'path';
import { UnifiedTool, StructuredToolResult } from './registry.js';
import { executeCodex } from '../utils/codexExecutor.js';
import { resolveWorkingDirectory } from '../utils/workingDirResolver.js';
import { parseConversationIdFromOutput } from '../utils/sessionStorage.js';
import { Logger } from '../utils/logger.js';
import { MODELS } from '../constants.js';
import {
  IMAGE_USE_CASES,
  IMAGE_PRESETS,
  REFERENCE_ROLES,
  ASPECT_PATTERN,
  buildImageSpec,
  buildRelayPrompt,
  ImagePreset,
  ReferenceRole,
} from '../utils/imagePromptBuilder.js';

// Codex's image_gen caps recent-image inclusion at 5; assume the same cap for referenced paths.
const MAX_INPUT_IMAGES = 5;
const INPUT_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const referenceSchema = z.object({
  path: z.string().min(1).describe('Image file path (absolute or relative to workingDir)'),
  role: z
    .enum(Object.keys(REFERENCE_ROLES) as [ReferenceRole, ...ReferenceRole[]])
    .default('general')
    .describe(
      'How the image model should use it: identity, style, logo, layout, subject, or general'
    ),
});

const imageGenArgsSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .describe('What to create, or for edits, what to change. Be concrete about the subject.'),
  editImage: z
    .string()
    .optional()
    .describe('Image to edit (absolute or relative to workingDir). Switches to edit mode.'),
  preserve: z
    .array(z.string())
    .optional()
    .describe('Edit invariants, e.g. ["person and pose", "all text outside the sign"]'),
  references: z
    .array(referenceSchema)
    .optional()
    .describe(`Reference images with roles. Up to ${MAX_INPUT_IMAGES} images including editImage.`),
  useCase: z
    .enum(IMAGE_USE_CASES)
    .optional()
    .describe('Task category from the Codex imagegen taxonomy; sets the polish level'),
  assetType: z
    .string()
    .optional()
    .describe('Where the image will be used, e.g. "landing page hero", "app store screenshot"'),
  style: z.string().optional().describe('Medium and style, e.g. "35mm film photo", "flat vector"'),
  composition: z.string().optional().describe('Framing, viewpoint, placement, negative space'),
  lighting: z.string().optional().describe('Lighting and mood'),
  palette: z.string().optional().describe('Color palette'),
  materials: z.string().optional().describe('Materials and textures'),
  text: z.string().optional().describe('Exact in-image text, rendered verbatim'),
  typography: z.string().optional().describe('Font style, size, color and placement for `text`'),
  avoid: z.array(z.string()).optional().describe('Things that must not appear'),
  aspect: z
    .string()
    .regex(ASPECT_PATTERN)
    .optional()
    .describe(
      'Aspect ratio: square, landscape (3:2), portrait (2:3), wide (16:9), tall (9:16), or W:H. Requested via the prompt; exact pixel size is chosen by Codex.'
    ),
  transparentBackground: z
    .boolean()
    .optional()
    .describe('Ask for a transparent (alpha) background; check `hasAlpha` in the result'),
  presets: z
    .array(z.enum(Object.keys(IMAGE_PRESETS) as [ImagePreset, ...ImagePreset[]]))
    .optional()
    .describe(
      'Guidance blocks: photoreal, portrait, likeness, product, thumbnail, no-text, exact-text, brand-style'
    ),
  enhance: z
    .boolean()
    .default(true)
    .describe(
      'Let the Codex host model enrich generic prompts with composition/lighting detail (never adds new subjects or text). false = pass the spec verbatim.'
    ),
  variants: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(1)
    .describe('Number of images; each is a separate image_gen call'),
  outputPath: z
    .string()
    .optional()
    .describe(
      'Copy results here (relative to workingDir). A path ending in / is a directory. Without it, images stay in $CODEX_HOME/generated_images.'
    ),
  overwrite: z
    .boolean()
    .default(false)
    .describe('Overwrite an existing outputPath instead of writing a -v2 sibling'),
  model: z
    .string()
    .optional()
    .describe(
      `Host model that relays the call (not the image model). Known: ${Object.values(MODELS).join(', ')}. Omit to use the Codex default.`
    ),
  reasoningEffort: z
    .enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
    .default('low')
    .describe('Host model reasoning. Default low: the host only relays the prepared spec.'),
  workingDir: z.string().optional().describe('Working directory for relative paths'),
  timeout: z
    .number()
    .default(600000)
    .describe('Timeout in ms. Default 10 min; each image takes roughly 30-90s.'),
});

function codexHome(): string {
  return process.env.CODEX_HOME || join(homedir(), '.codex');
}

function resolveInputImage(p: string, baseDir: string, label: string): string {
  const abs = isAbsolute(p) ? p : resolve(baseDir, p);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new Error(`${label} not found: ${abs}`);
  }
  if (!INPUT_IMAGE_EXTENSIONS.has(extname(abs).toLowerCase())) {
    throw new Error(`${label} must be png, jpg, webp or gif: ${abs}`);
  }
  return abs;
}

/** Read width/height/alpha from a PNG header without decoding the image. */
function readPngInfo(file: string): { width: number; height: number; hasAlpha: boolean } | null {
  const buf = Buffer.alloc(26);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buf, 0, 26, 0);
  } finally {
    closeSync(fd);
  }
  if (buf.toString('latin1', 1, 4) !== 'PNG' || buf.toString('latin1', 12, 16) !== 'IHDR') {
    return null;
  }
  const colorType = buf[25];
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    // 4 = grayscale+alpha, 6 = RGBA. A tRNS chunk can add alpha to other types; not checked here.
    hasAlpha: colorType === 4 || colorType === 6,
  };
}

function listImages(dir: string, since = 0): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map(name => join(dir, name))
    .filter(f => statSync(f).isFile() && statSync(f).mtimeMs >= since)
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

/**
 * Locate this run's images. Codex writes them to generated_images/<thread id>/,
 * and `codex exec` prints the thread id as "session id: …". If that line is
 * missing, fall back to files created in any thread directory during the run.
 */
function collectGeneratedImages(
  threadId: string | null,
  startedAt: number
): { files: string[]; located: 'thread' | 'mtime-scan' } {
  const root = join(codexHome(), 'generated_images');
  if (threadId) {
    const files = listImages(join(root, threadId));
    if (files.length) return { files, located: 'thread' };
  }
  if (!existsSync(root)) return { files: [], located: 'mtime-scan' };
  const files = readdirSync(root)
    .map(name => join(root, name))
    .filter(d => statSync(d).isDirectory())
    .flatMap(d => listImages(d, startedAt));
  return { files, located: 'mtime-scan' };
}

function nextFreePath(target: string): string {
  if (!existsSync(target)) return target;
  const ext = extname(target);
  const stem = target.slice(0, target.length - ext.length);
  for (let v = 2; ; v++) {
    const candidate = `${stem}-v${v}${ext}`;
    if (!existsSync(candidate)) return candidate;
  }
}

function destinationFor(
  outputPath: string,
  baseDir: string,
  source: string,
  index: number,
  total: number
): string {
  const isDir = outputPath.endsWith('/') || outputPath.endsWith('\\');
  const abs = isAbsolute(outputPath) ? outputPath : resolve(baseDir, outputPath);
  if (isDir) return join(abs, basename(source));
  const srcExt = extname(source);
  let target = extname(abs) ? abs : `${abs}${srcExt}`;
  if (extname(target).toLowerCase() !== srcExt.toLowerCase()) {
    // Codex decides the encoding; never mislabel a PNG as .jpg.
    target = target.slice(0, target.length - extname(target).length) + srcExt;
  }
  if (total > 1) {
    const ext = extname(target);
    target = `${target.slice(0, target.length - ext.length)}-${index + 1}${ext}`;
  }
  return target;
}

export const imageGenTool: UnifiedTool = {
  name: 'image-gen',
  description:
    "Generate or edit images with Codex's built-in image_gen tool (ChatGPT login, no API key). Builds a structured prompt from use case, style, composition, exact text, reference roles and edit invariants, then returns the saved file paths. The image model and pixel size are chosen by Codex; aspect ratio and transparency are requested through the prompt.",
  zodSchema: imageGenArgsSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      images: { type: 'array' },
      requested: { type: 'number' },
      threadId: { type: ['string', 'null'] },
      spec: { type: 'string' },
      durationMs: { type: 'number' },
      warnings: { type: 'array' },
      error: { type: 'string' },
    },
    required: ['status', 'images', 'requested', 'spec', 'durationMs', 'warnings'],
  },
  prompt: {
    description: "Generate or edit an image with Codex's built-in image_gen tool",
  },
  category: 'codex',
  execute: async (args, onProgress) => {
    const a = args as unknown as z.infer<typeof imageGenArgsSchema>;
    const baseDir = resolveWorkingDirectory({ workingDir: a.workingDir }) || process.cwd();

    const editImage = a.editImage
      ? resolveInputImage(a.editImage, baseDir, 'editImage')
      : undefined;
    const references = (a.references ?? []).map((r, i) => ({
      path: resolveInputImage(r.path, baseDir, `references[${i}]`),
      role: r.role,
    }));
    const imagePaths = [...(editImage ? [editImage] : []), ...references.map(r => r.path)];
    if (imagePaths.length > MAX_INPUT_IMAGES) {
      throw new Error(
        `Too many input images (${imagePaths.length}); Codex image_gen accepts at most ${MAX_INPUT_IMAGES}.`
      );
    }

    const spec = buildImageSpec({ ...a, editImage, references });
    const relay = buildRelayPrompt({
      spec,
      imagePaths,
      variants: a.variants,
      enhance: a.enhance,
    });

    const warnings: string[] = [];
    const startedAt = Date.now();
    onProgress?.(
      `Generating ${a.variants} image(s) via Codex image_gen${editImage ? ' (edit)' : ''}...`
    );

    let threadId: string | null = null;
    let hostReply = '';
    let error: string | undefined;
    try {
      const result = await executeCodex(
        relay,
        {
          model: a.model,
          reasoningEffort: a.reasoningEffort,
          // The host needs no shell or file writes; image_gen saves under $CODEX_HOME itself.
          sandboxMode: 'read-only' as any,
          approvalPolicy: 'never' as any,
          workingDir: baseDir,
          skipGitRepoCheck: true,
          ephemeral: true,
          timeout: a.timeout,
        },
        onProgress
      );
      hostReply = result.output.trim();
      threadId = parseConversationIdFromOutput(`${result.stderr}\n${result.output}`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      Logger.error('image-gen: Codex run failed:', error);
    }

    // Collect even after a failure or timeout: finished images are still on disk.
    const { files, located } = collectGeneratedImages(threadId, startedAt);
    if (located === 'mtime-scan' && files.length) {
      warnings.push(
        'Thread id not found in Codex output; images were matched by creation time and may include output from concurrent runs.'
      );
    }
    if (files.length < a.variants) {
      warnings.push(`Requested ${a.variants} image(s), found ${files.length}.`);
    }
    if (/\bFAILED:/i.test(hostReply)) {
      warnings.push(`Codex reported: ${hostReply.slice(0, 500)}`);
    }

    const images = files.map((source, i) => {
      let path = source;
      if (a.outputPath) {
        let target = destinationFor(a.outputPath, baseDir, source, i, files.length);
        if (!a.overwrite) target = nextFreePath(target);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
        path = target;
      }
      const info = extname(source).toLowerCase() === '.png' ? readPngInfo(source) : null;
      if (a.transparentBackground && info && !info.hasAlpha) {
        warnings.push(`${basename(path)} has no alpha channel despite transparentBackground.`);
      }
      return { path, source, ...(info ?? {}) };
    });

    const status =
      images.length === 0 ? 'failed' : images.length < a.variants ? 'partial' : 'success';
    const durationMs = Date.now() - startedAt;
    const structured = {
      status,
      images,
      requested: a.variants,
      threadId,
      spec,
      durationMs,
      warnings,
      ...(error ? { error } : {}),
    };

    const lines = [
      status === 'failed'
        ? `Image generation failed${error ? `: ${error}` : '.'}`
        : `Generated ${images.length}/${a.variants} image(s) in ${Math.round(durationMs / 1000)}s:`,
      ...images.map(
        img =>
          `- ${img.path}${'width' in img ? ` (${img.width}x${img.height}${img.hasAlpha ? ', alpha' : ''})` : ''}`
      ),
      ...(warnings.length ? ['', 'Warnings:', ...warnings.map(w => `- ${w}`)] : []),
      '',
      'Prompt spec:',
      spec,
    ];

    return { text: lines.join('\n'), structuredContent: structured } as StructuredToolResult;
  },
};
