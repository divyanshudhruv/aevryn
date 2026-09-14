export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await params;
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 text-center">
      {/* <img
        src="/placeholder.png"
        alt="placeholder"
        className={`size-50 object-contain ` + ""}
      /> */}
      <p className="text-sm text-muted-foreground">
        Select or create a thread/group to get started.
      </p>
    </div>
  );
}
