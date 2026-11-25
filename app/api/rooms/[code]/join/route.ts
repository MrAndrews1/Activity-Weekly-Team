import { body, handle } from "@/lib/api";
import { join, normCode } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const b = await body(req);
  return handle(() => join(normCode(code), b.name, b.playerId));
}
