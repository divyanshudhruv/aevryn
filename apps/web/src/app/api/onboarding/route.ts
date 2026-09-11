import { NextResponse } from "next/server";
import type { AskUserAnswer } from "@aevryn/ui/components/ui/ask-user-questions";

import { createServerSupabaseForNext } from "@/lib/supabase-server";
import { requireUser } from "@aevryn/auth";

export async function POST(request: Request) {
	const supabase = await createServerSupabaseForNext();
	const user = await requireUser(supabase);

	const body = (await request.json().catch(() => null)) as {
		answers?: Record<string, AskUserAnswer>;
	} | null;

	if (!body?.answers || typeof body.answers !== "object") {
		return NextResponse.json({ error: "Invalid answers" }, { status: 400 });
	}

	const { error } = await supabase
		.from("user_profiles")
		.update({
			pre_answers: body.answers,
			onboarded: true,
		})
		.eq("user_id", user.id);

	if (error) {
		return NextResponse.json({ error: "Failed to save answers" }, { status: 500 });
	}

	return NextResponse.json({ ok: true });
}