export default function SharePage({ params }: { params: { token: string } }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
      <p className="text-[13px] font-medium">Shared thread</p>
      <p className="max-w-md text-center text-[12px] text-muted-foreground">
        This link goes to a shared view of a thread. Public sharing is a
        showcase — paste this token into a support request to reference it.
      </p>
      <code className="rounded-md border border-border bg-card px-2 py-1 text-[11px]">
        {params.token}
      </code>
    </main>
  );
}