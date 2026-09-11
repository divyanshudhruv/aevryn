export default function ThreadPage({
	params,
}: {
	params: Promise<{ workspaceId: string; threadId: string }>;
}) {
	return (
		<div>
			<h1>Workspace</h1>
		</div>
	);
}