/**
 * Prompt construction for the built-in Codex `image_gen` tool.
 *
 * The built-in tool accepts only `prompt` and `referenced_image_paths`: there is
 * no size, quality, format or mask argument, and the image model is fixed by
 * Codex. Everything that steers the output therefore has to live in the prompt
 * text. This module turns structured MCP arguments into the labeled spec that
 * Codex's own `imagegen` skill recommends, and wraps it in relay instructions
 * so the host model calls the tool instead of improvising.
 */

export const IMAGE_USE_CASES = [
  // Generate
  'photorealistic-natural',
  'product-mockup',
  'ui-mockup',
  'infographic-diagram',
  'scientific-educational',
  'ads-marketing',
  'productivity-visual',
  'logo-brand',
  'illustration-story',
  'stylized-concept',
  'historical-scene',
  // Edit
  'text-localization',
  'identity-preserve',
  'precise-object-edit',
  'lighting-weather',
  'background-extraction',
  'style-transfer',
  'compositing',
  'sketch-to-render',
] as const;
export type ImageUseCase = (typeof IMAGE_USE_CASES)[number];

export const IMAGE_PRESETS = {
  photoreal:
    'Photorealistic: real camera optics, natural light falloff and concrete real-world texture (skin pores, fabric weave, material grain, small everyday imperfections). No plastic or airbrushed look.',
  portrait:
    'Intentional portrait: clear facial structure, controlled flattering light, natural skin texture, eyes in sharp focus; honor the requested medium and crop.',
  likeness:
    "Preserve the identity reference's distinguishing facial features, proportions, skin tone and hairline. Do not blend identities or copy the reference's background clutter.",
  product:
    'Product shot: keep the product recognizable and accurate in shape, color and material, with clean subject separation and lighting that reveals form.',
  thumbnail:
    'Thumbnail: one clear focal point, strong contrast and a readable hierarchy that still works at small display sizes.',
  'no-text':
    'No lettering anywhere: no captions, labels, logos, UI text, signatures or watermarks.',
  'exact-text':
    'Render the quoted text verbatim: same language, spelling, case, punctuation and line breaks. Do not translate, shorten, paraphrase, duplicate or add any other text. Keep it crisp and legible.',
  'brand-style':
    'Apply the stated brand palette, materials, lighting and typography direction consistently across the whole image.',
} as const;
export type ImagePreset = keyof typeof IMAGE_PRESETS;

export const REFERENCE_ROLES = {
  identity:
    'identity anchor for the subject; keep their features, do not copy pose, clothing or background unless asked',
  style:
    'style reference; take palette, materials, lighting and visual density only, not people, scenery or lettering',
  logo: 'logo/mark; keep its shape, proportions, colors and exact lettering, place or restyle it only as requested',
  layout:
    'layout reference; follow its spatial arrangement and scale only, not its identities, text or style',
  subject: 'subject to place into the new image; keep it recognizable',
  general: 'reference; use only for the purpose stated in the request',
} as const;
export type ReferenceRole = keyof typeof REFERENCE_ROLES;

const ASPECT_PRESETS: Record<string, string> = {
  square: '1:1 square',
  landscape: '3:2 landscape',
  portrait: '2:3 portrait',
  wide: '16:9 widescreen landscape',
  tall: '9:16 vertical portrait',
};

export const ASPECT_PATTERN = /^(square|landscape|portrait|wide|tall|\d{1,2}:\d{1,2})$/;

export interface ImageReference {
  path: string; // absolute
  role: ReferenceRole;
}

export interface ImageSpecInput {
  prompt: string;
  editImage?: string; // absolute path of the edit target
  references?: ImageReference[];
  preserve?: string[];
  useCase?: ImageUseCase;
  assetType?: string;
  style?: string;
  composition?: string;
  lighting?: string;
  palette?: string;
  materials?: string;
  text?: string;
  typography?: string;
  avoid?: string[];
  aspect?: string;
  transparentBackground?: boolean;
  presets?: ImagePreset[];
}

export interface RelayInput {
  spec: string;
  imagePaths: string[]; // in the order the spec numbers them
  variants: number;
  enhance: boolean;
}

function describeAspect(aspect: string): string {
  const named = ASPECT_PRESETS[aspect];
  if (named) return named;
  const [w, h] = aspect.split(':').map(Number);
  const shape = w === h ? 'square' : w > h ? 'landscape' : 'portrait';
  return `${aspect} ${shape}`;
}

export function validateImageSpec(input: ImageSpecInput): void {
  const presets = input.presets ?? [];
  if (presets.includes('no-text') && (presets.includes('exact-text') || input.text)) {
    throw new Error('The no-text preset conflicts with requested in-image text.');
  }
  if (presets.includes('exact-text') && !input.text) {
    throw new Error('The exact-text preset requires the `text` argument.');
  }
  if (input.preserve?.length && !input.editImage) {
    throw new Error('`preserve` only applies to edits; pass `editImage` as well.');
  }
  if (input.aspect && !ASPECT_PATTERN.test(input.aspect)) {
    throw new Error(
      `Invalid aspect "${input.aspect}". Use square, landscape, portrait, wide, tall, or W:H.`
    );
  }
}

/**
 * Build the labeled spec that becomes the `prompt` argument of `image_gen`.
 * Lines follow the order recommended by the Codex imagegen skill:
 * intent -> inputs -> scene/subject -> style -> composition -> text -> constraints.
 */
export function buildImageSpec(input: ImageSpecInput): string {
  validateImageSpec(input);

  const isEdit = Boolean(input.editImage);
  const lines: string[] = [];
  const push = (label: string, value?: string) => {
    const v = value?.trim();
    if (v) lines.push(`${label}: ${v}`);
  };

  push('Use case', input.useCase);
  push('Asset type', input.assetType);
  push(isEdit ? 'Edit request' : 'Primary request', input.prompt);

  const refs = input.references ?? [];
  const imageLines: string[] = [];
  let index = 1;
  if (input.editImage) {
    imageLines.push(`Image ${index++}: edit target; modify only what the request asks for`);
  }
  for (const ref of refs) {
    imageLines.push(`Image ${index++}: ${ref.role} - ${REFERENCE_ROLES[ref.role]}`);
  }
  if (imageLines.length) {
    lines.push(`Input images:\n${imageLines.map(l => `- ${l}`).join('\n')}`);
  }

  push('Style/medium', input.style);
  push('Composition/framing', input.composition);
  push('Lighting/mood', input.lighting);
  push('Color palette', input.palette);
  push('Materials/textures', input.materials);
  if (input.aspect) push('Canvas', `${describeAspect(input.aspect)} aspect ratio`);
  if (input.transparentBackground) {
    push(
      'Background',
      'genuinely transparent (alpha channel), isolated subject with clean edges, no backdrop, no drop shadow on a colored ground'
    );
  }

  if (input.text?.trim()) {
    lines.push(`Text (verbatim): "${input.text.trim()}"`);
    push('Typography/placement', input.typography);
  }

  const constraints: string[] = [];
  if (isEdit) {
    constraints.push(
      'change only what the edit request asks for; keep identity, composition, camera angle, lighting, textures and all other text unchanged'
    );
    for (const p of input.preserve ?? []) {
      if (p.trim()) constraints.push(`keep unchanged: ${p.trim()}`);
    }
  }
  for (const preset of input.presets ?? []) {
    constraints.push(IMAGE_PRESETS[preset]);
  }
  if (constraints.length) {
    lines.push(`Constraints:\n${constraints.map(c => `- ${c}`).join('\n')}`);
  }

  const avoid = (input.avoid ?? []).map(a => a.trim()).filter(Boolean);
  if (!(input.presets ?? []).includes('no-text') && !input.text) {
    // Unrequested lettering is the most common artifact; ask for none unless text was requested.
    avoid.push('unrequested text or watermarks');
  }
  if (avoid.length) push('Avoid', avoid.join('; '));

  return lines.join('\n');
}

const ENHANCE_RULES = `You may refine the spec before passing it on, but only like this:
- If the primary request is generic, add concise composition, lighting or material detail that materially improves the image.
- If it is already specific, keep it as is; only fix obvious ambiguity.
- Never add characters, objects, brands, slogans, palettes or text that the spec does not imply.
- Keep every labeled line of the spec, including Input images, Canvas, Text (verbatim), Constraints and Avoid, with its meaning unchanged.`;

/**
 * Wrap the spec in instructions for the Codex host model. The host only relays;
 * all creative intent is already in the spec.
 */
export function buildRelayPrompt({ spec, imagePaths, variants, enhance }: RelayInput): string {
  const pathsJson = JSON.stringify(imagePaths);
  const refsRule = imagePaths.length
    ? `Set \`referenced_image_paths\` to exactly ${pathsJson} (same order; Image N in the spec is element N). Do not use \`num_last_images_to_include\`.` +
      (enhance
        ? ' You may inspect them with `view_image` to refine the spec.'
        : ' Do not call `view_image`; the paths are enough.')
    : 'Omit both `referenced_image_paths` and `num_last_images_to_include`; this is a brand-new image.';
  const callRule =
    variants > 1
      ? `Call the built-in \`image_gen\` tool exactly ${variants} times, once per variant. For call k, append the line "Variant k of ${variants}: keep every requirement above, but vary composition and camera angle from the other variants." to the prompt.`
      : 'Call the built-in `image_gen` tool exactly once.';
  const promptRule = enhance
    ? `Use the IMAGE SPEC as the \`prompt\` argument.\n${ENHANCE_RULES}`
    : `Pass the IMAGE SPEC as the \`prompt\` argument verbatim, without rewording, shortening or adding detail${variants > 1 ? ' (apart from the Variant line above)' : ''}.`;

  return `You are an image-generation relay. Your only job is to call the built-in \`image_gen\` tool.

Rules:
- ${callRule}
- ${promptRule}
- ${refsRule}
- Do not run shell commands, edit files, or copy/move generated images; the caller collects them.
- Do not ask questions or request confirmation.
- If \`image_gen\` fails, do not retry with any other tool or script.
- When finished, reply with exactly DONE, or FAILED: <reason> if any call failed.

IMAGE SPEC:
<<<
${spec}
>>>`;
}
