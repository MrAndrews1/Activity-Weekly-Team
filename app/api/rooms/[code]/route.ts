import { handle } from "@/lib/api";
import { getState, normCode } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const url = new URL(req.url);
  return handle(() =>
    getState(normCode(code), {
      playerId: url.searchParams.get("playerId"),
      hostKey: req.headers.get("x-host-key"),
    })
  );
}
