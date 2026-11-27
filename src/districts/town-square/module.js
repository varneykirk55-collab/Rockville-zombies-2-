// District A. The town-square agent owns this directory and
// public/data/districts/town-square/. Central files load this module by
// manifest; they do not need an edit when the model list or extension changes.
export async function register(ctx) {
  ctx.shared.districts = ctx.shared.districts ?? {};
  ctx.shared.districts['town-square'] = { code: 'A' };
  if (!ctx.extension) return;
  const extension = await import(new URL(ctx.extension, import.meta.url).href);
  if (typeof extension.register === 'function') await extension.register(ctx);
}
