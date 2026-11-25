import { body, handle } from "@/lib/api";
import { createRoom } from "@/lib/game";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body(req);
  return handle(() => createRoom(typeof b.title === "string" ? b.title : undefined));
}
