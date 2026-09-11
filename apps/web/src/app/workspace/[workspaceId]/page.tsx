export default function WorkspaceHomePage({
	params,
}: {
	params: Promise<{ workspaceId: string }>;
}) {
	return (
		<div className="container mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
			<h1 className="text-xl font-semibold">Workspace</h1>
			<p className="text-sm text-muted-foreground">
				The app shell lands here — chat, sidebar, and groups wire up in the
				UI phase.
			</p>
		</div>
	);
}