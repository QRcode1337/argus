import { PostProcessStage, type Viewer } from "cesium";

import type { VisualMode, VisualParams } from "@/types/intel";

type StageMap = {
  nvg: PostProcessStage;
  flir: PostProcessStage;
  crt: PostProcessStage;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const nvgShader = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
uniform float intensity;
uniform float gain;
uniform float bloom;
uniform float scanlines;
uniform float pixelation;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = v_textureCoordinates;
  float pix = max(1.0, mix(1.0, 22.0, pixelation));
  vec2 grid = vec2(1920.0 / pix, 1080.0 / pix);
  uv = floor(uv * grid) / grid;

  vec4 color = texture(colorTexture, uv);
  float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  float bright = smoothstep(0.45, 1.0, luma) * bloom;

  float noise = (hash(uv * 2500.0 + float(czm_frameNumber) * 0.3) - 0.5) * 0.06;
  float line = sin(uv.y * mix(300.0, 1700.0, scanlines) + float(czm_frameNumber) * 0.02) * 0.05;
  float vignette = smoothstep(0.94, 0.28, distance(v_textureCoordinates, vec2(0.5)));

  float energy = (luma * (0.45 + gain * 1.35)) + bright + noise + line;
  vec3 green = vec3(0.03, 0.98, 0.25) * energy * vignette;

  out_FragColor = vec4(mix(color.rgb, green, intensity), color.a);
}
`;

const flirShader = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
uniform float intensity;
uniform float bias;
uniform float contrast;
uniform float posterize;

vec3 ramp(float t) {
  vec3 c1 = vec3(0.03, 0.02, 0.11);
  vec3 c2 = vec3(0.35, 0.05, 0.03);
  vec3 c3 = vec3(0.84, 0.26, 0.02);
  vec3 c4 = vec3(0.98, 0.96, 0.90);

  if (t < 0.33) {
    return mix(c1, c2, t / 0.33);
  } else if (t < 0.66) {
    return mix(c2, c3, (t - 0.33) / 0.33);
  }

  return mix(c3, c4, (t - 0.66) / 0.34);
}

void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);
  float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));

  float shifted = clamp((luma + (bias - 0.5) * 0.45), 0.0, 1.0);
  float contrasted = clamp((shifted - 0.5) * (0.65 + contrast * 2.0) + 0.5, 0.0, 1.0);

  float bands = mix(256.0, 10.0, posterize);
  float quantized = floor(contrasted * bands) / bands;

  vec3 thermal = ramp(quantized);
  out_FragColor = vec4(mix(color.rgb, thermal, intensity), color.a);
}
`;

const crtShader = `
uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
uniform float intensity;
uniform float scanlineDensity;
uniform float chromaticShift;
uniform float distortion;
uniform float instability;

void main() {
  vec2 uv = v_textureCoordinates;
  vec2 centered = uv * 2.0 - 1.0;

  float bend = dot(centered, centered) * (0.03 + distortion * 0.35);
  vec2 warped = uv + centered * bend;

  float wobble = sin(float(czm_frameNumber) * 0.03 + uv.y * 50.0) * (0.001 + instability * 0.004);
  warped.x += wobble;

  float shift = (0.0005 + chromaticShift * 0.0034) * intensity;
  float r = texture(colorTexture, vec2(warped.x + shift, warped.y)).r;
  float g = texture(colorTexture, warped).g;
  float b = texture(colorTexture, vec2(warped.x - shift, warped.y)).b;

  float density = mix(380.0, 2100.0, scanlineDensity);
  float scan = sin(warped.y * density) * 0.07;

  float edge = smoothstep(1.04, 0.26, distance(uv, vec2(0.5)));
  vec3 crt = (vec3(r, g, b) + scan) * edge;

  vec4 original = texture(colorTexture, uv);
  out_FragColor = vec4(mix(original.rgb, crt, intensity), original.a);
}
`;

export class VisualModeController {
  private viewer: Viewer;

  private stages: StageMap;

  constructor(viewer: Viewer) {
    this.viewer = viewer;

    this.stages = {
      nvg: this.makeStage("argus-nvg", nvgShader, {
        intensity: 0.75,
        gain: 0.75,
        bloom: 0.45,
        scanlines: 0.6,
        pixelation: 0.2,
      }),
      flir: this.makeStage("argus-flir", flirShader, {
        intensity: 0.75,
        bias: 0.52,
        contrast: 0.68,
        posterize: 0.4,
      }),
      crt: this.makeStage("argus-crt", crtShader, {
        intensity: 0.75,
        scanlineDensity: 0.6,
        chromaticShift: 0.45,
        distortion: 0.2,
        instability: 0.35,
      }),
    };
  }

  private makeStage(
    name: string,
    fragmentShader: string,
    uniforms: Record<string, number>,
  ): PostProcessStage {
    const stage = new PostProcessStage({
      name,
      fragmentShader,
      uniforms,
    });

    stage.enabled = false;
    this.viewer.scene.postProcessStages.add(stage);
    return stage;
  }

  setMode(mode: VisualMode): void {
    this.stages.nvg.enabled = mode === "nvg";
    this.stages.flir.enabled = mode === "flir";
    this.stages.crt.enabled = mode === "crt";
  }

  setIntensity(value: number): void {
    const level = clamp(value, 0, 1);
    this.stages.nvg.uniforms.intensity = level;
    this.stages.flir.uniforms.intensity = level;
    this.stages.crt.uniforms.intensity = level;
  }

  setParams(params: VisualParams): void {
    this.stages.nvg.uniforms.gain = clamp(params.nvg.gain, 0, 1);
    this.stages.nvg.uniforms.bloom = clamp(params.nvg.bloom, 0, 1);
    this.stages.nvg.uniforms.scanlines = clamp(params.nvg.scanlines, 0, 1);
    this.stages.nvg.uniforms.pixelation = clamp(params.nvg.pixelation, 0, 1);

    this.stages.flir.uniforms.bias = clamp(params.flir.bias, 0, 1);
    this.stages.flir.uniforms.contrast = clamp(params.flir.contrast, 0, 1);
    this.stages.flir.uniforms.posterize = clamp(params.flir.posterize, 0, 1);

    this.stages.crt.uniforms.scanlineDensity = clamp(params.crt.scanlineDensity, 0, 1);
    this.stages.crt.uniforms.chromaticShift = clamp(params.crt.chromaticShift, 0, 1);
    this.stages.crt.uniforms.distortion = clamp(params.crt.distortion, 0, 1);
    this.stages.crt.uniforms.instability = clamp(params.crt.instability, 0, 1);
  }

  destroy(): void {
    this.viewer.scene.postProcessStages.remove(this.stages.nvg);
    this.viewer.scene.postProcessStages.remove(this.stages.flir);
    this.viewer.scene.postProcessStages.remove(this.stages.crt);
  }
}
