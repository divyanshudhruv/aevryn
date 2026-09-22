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
		<div className="flex h-full min-h-0 flex-col items-center justify-center gap-6 overflow-hidden px-4 text-center">
			<div
				className="pointer-events-none flex h-fit flex-col items-center justify-center gap-3"
				unselectable="on"
			>
				<div className="hidden flex-wrap items-end justify-center gap-2 md:gap-4 dark:flex">
					<img
						src="/logo-black.svg"
						alt=""
						aria-hidden
						draggable={false}
						className="fade-in h-14 w-auto max-w-[80vw] animate-in select-none opacity-30 duration-500 md:h-24"
					/>
					<img
						src="/aevryn-black.svg"
						alt=""
						aria-hidden
						draggable={false}
						className="fade-in h-10 w-auto max-w-[70vw] animate-in select-none opacity-30 duration-500 md:h-18"
					/>
				</div>
				<div className="flex flex-wrap items-end justify-center gap-2 md:gap-4 dark:hidden">
					<img
						src="/logo-white.svg"
						alt=""
						aria-hidden
						draggable={false}
						className="fade-in h-14 w-auto max-w-[80vw] animate-in select-none opacity-37 duration-500 md:h-24"
					/>
					<img
						src="/aevryn-white.svg"
						alt=""
						aria-hidden
						draggable={false}
						className="fade-in h-10 w-auto max-w-[70vw] animate-in select-none opacity-37 duration-500 md:h-18"
					/>
				</div>
			</div>
		</div>
	);
}
