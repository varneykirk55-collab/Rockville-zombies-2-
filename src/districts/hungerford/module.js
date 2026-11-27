// District B. Path is src/districts/hungerford/ so branch
// grok/hungerford-corridor can rebase onto this foundation.
// Put new behaviour in a file named by public/data/districts/hungerford/module.json
// ("extension") instead of editing src/main.js or this register function.
export async function register(ctx) {
  ctx.shared.districts = ctx.shared.districts ?? {};
  ctx.shared.districts.hungerford = { code: 'B' };
  if (!ctx.extension) return;
  const extension = await import(new URL(ctx.extension, import.meta.url).href);
  if (typeof extension.register === 'function') await extension.register(ctx);
}
