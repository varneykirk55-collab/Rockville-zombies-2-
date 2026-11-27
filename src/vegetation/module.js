import { addTrees } from './trees.js';

// Backdrop trees and later landscaping. The vegetation agent owns this directory.
export async function register(ctx) {
  const trees = addTrees(ctx.world, ctx.terrain, ctx.features);
  ctx.shared.trees = trees;
  if (ctx.extension) {
    const extension = await import(/* @vite-ignore */ new URL(ctx.extension, import.meta.url).href);
    if (typeof extension.register === 'function') await extension.register(ctx);
  }
}
