import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { jsonError, Errors } from "@/lib/api/errors";
import { createCategorySchema } from "@/lib/validation/budgets";

export async function GET() {
  try {
    const { user, supabase } = await requireUser();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order("name");
    if (error) throw Errors.internal();
    return NextResponse.json({ categories: data });
  } catch (error) {
    return jsonError(error, "GET /api/categories");
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireUser();
    const input = createCategorySchema.parse(await request.json());

    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: user.id, name: input.name, color: input.color, icon: input.icon })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw Errors.conflict("You already have a category with that name.");
      throw Errors.internal();
    }

    return NextResponse.json({ category: data }, { status: 201 });
  } catch (error) {
    return jsonError(error, "POST /api/categories");
  }
}
