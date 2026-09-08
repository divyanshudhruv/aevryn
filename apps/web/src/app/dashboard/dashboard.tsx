"use client";
import { useQuery } from "@tanstack/react-query";

import { ObjectiveRunner } from "@/components/objective-runner";
import { trpc } from "@/utils/trpc";

export default function Dashboard() {
	const privateData = useQuery(trpc.privateData.queryOptions());

	return (
		<>
			<ObjectiveRunner />
			<p>API: {privateData.data?.message}</p>
		</>
	);
}
