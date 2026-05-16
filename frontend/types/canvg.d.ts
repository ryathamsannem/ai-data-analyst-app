/**
 * Ambient typings: canvg ships .d.ts but package "exports" can block resolution
 * under moduleResolution "bundler" (TS7016 in the IDE).
 */
declare module "canvg" {
  export class Canvg {
    static fromString(
      ctx: CanvasRenderingContext2D,
      svg: string,
      options?: Record<string, unknown>
    ): Promise<Canvg>;
    render(): Promise<void>;
  }
}
