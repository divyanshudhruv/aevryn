export const metadata = {
	title: "Workspace",
};

export default async function WorkspaceHomePage({
	params,
}: {
	params: Promise<{ workspaceId: string }>;
}) {
	await params;
	return (
		<div className="flex h-full min-h-0 flex-col items-center justify-center gap-6 text-center">
			{/* <img
        src="/placeholder.png"
        alt="placeholder"
        className={`size-50 object-contain ` + ""}
      /> */}

			<div
				className="pointer-events-none mb-16 flex h-fit flex-col items-center justify-center gap-4"
				unselectable="on"
			>
				{/* Both variants rendered; CSS picks by theme — no hydration flash. */}
				{/* Dark theme: icon + wordmark pair. */}
				<div className="hidden items-end justify-center gap-4 dark:flex">
					<img
						src="/logo-black.svg"
						alt=""
						aria-hidden
						draggable={false}
						className="fade-in h-24 w-auto animate-in select-none opacity-30 duration-500"
					/>
					<img
						src="/aevryn-black.svg"
						alt=""
						aria-hidden
						draggable={false}
						className="fade-in h-18 w-auto animate-in select-none opacity-30 duration-500"
					/>
				</div>
				{/* Light theme: same pair, dark artwork. */}
				<div className="flex items-end justify-center gap-4 dark:hidden">
					<img
						src="/logo-white.svg"
						alt=""
						aria-hidden
						draggable={false}
						className="fade-in h-24 w-auto animate-in select-none opacity-37 duration-500"
					/>
					<img
						src="/aevryn-white.svg"
						alt=""
						aria-hidden
						draggable={false}
						className="fade-in h-18 w-auto animate-in select-none opacity-37 duration-500"
					/>
				</div>

				{/* <p className="animate-in fade-in slide-in-from-bottom-1 text-md text-muted-background duration-700">
          Select a thread to get started
        </p> */}
			</div>
		</div>
	);
}
