import { body, handle } from "@/lib/api";
import { normCode, vote } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const b = await body(req);
  return handle(() => vote(normCode(code), b.playerId, b.target));
}
