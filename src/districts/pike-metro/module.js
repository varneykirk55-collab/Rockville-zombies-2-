// District D. The pike-metro agent owns this directory, the Metro station,
// the parking structures, and the pedestrian bridge (OSM way 266681164).
// Deck elevation is still unknown. Do not invent it.
export async function register(ctx) {
  ctx.shared.districts = ctx.shared.districts ?? {};
  ctx.shared.districts['pike-metro'] = { code: 'D' };
  if (!ctx.extension) return;
  const extension = await import(new URL(ctx.extension, import.meta.url).href);
  if (typeof extension.register === 'function') await extension.register(ctx);
}
