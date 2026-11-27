// District C. The regal-courthouse agent owns this directory and
// public/data/districts/regal-courthouse/.
export async function register(ctx) {
  ctx.shared.districts = ctx.shared.districts ?? {};
  ctx.shared.districts['regal-courthouse'] = { code: 'C' };
  if (!ctx.extension) return;
  const extension = await import(new URL(ctx.extension, import.meta.url).href);
  if (typeof extension.register === 'function') await extension.register(ctx);
}
