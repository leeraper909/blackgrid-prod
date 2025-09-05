export default async (req: Request, ctx: any) => {
  const byHeader = req.headers.get('x-kill-switch') === '1';
  const byEnv = (Deno.env.get('KILL_SWITCH') || '').match(/^(1|on|true)$/i);
  if (byHeader || byEnv) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Temporarily Unavailable</title>
       <h1>Temporarily Unavailable</h1><p>Please try again shortly.</p>`,
      { status: 503, headers: {
          'content-type': 'text/html; charset=utf-8',
          'retry-after': '120',
          'cache-control': 'no-store, max-age=0'
      }}
    );
  }
  return await ctx.next();
};
