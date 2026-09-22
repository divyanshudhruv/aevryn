import { cn } from "@aevryn/ui/lib/utils";

export function Logo({
	className,
	size = "md",
}: {
	className?: string;
	size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
}) {
	const logoHeight =
		size === "lg"
			? "h-11"
			: size === "sm"
				? "h-6"
				: size === "xl"
					? "h-14"
					: size === "2xl"
						? "h-16"
						: size === "3xl"
							? "h-20"
							: "h-8";
	const textHeight =
		size === "lg"
			? "h-7"
			: size === "sm"
				? "h-4"
				: size === "xl"
					? "h-8.4"
					: size === "2xl"
						? "h-11"
						: size === "3xl"
							? "h-14"
							: "h-5";

	const wordmarkMargin =
		size === "md"
			? "-mb-[2.25px]"
			: size === "sm"
				? "-mb-[1.75px]"
				: size === "lg"
					? "-mb-[3.35px]"
					: size === "xl"
						? "-mb-[4.45px]"
						: size === "2xl"
							? "-mb-[5.55px]"
							: "-mb-[7.2px]";

	const glyph = cn("w-auto shrink-0 opacity-90", logoHeight);
	const wordmark = cn("w-auto shrink-0 opacity-90", textHeight, wordmarkMargin);

	return (
		<a href="/">
			<div
				className={cn(
					"inline-flex shrink-0 items-end justify-center gap-1.5 dark:hidden",
					className,
				)}
			>
				<img src="/logo-black.svg" alt="" aria-hidden className={glyph} />
				<img src="/aevryn-black.svg" alt="" aria-hidden className={wordmark} />
			</div>
			<div
				className={cn(
					"hidden shrink-0 items-end justify-center gap-1.5 dark:inline-flex",
					className,
				)}
			>
				<img src="/logo-white.svg" alt="" aria-hidden className={glyph} />
				<img src="/aevryn-white.svg" alt="" aria-hidden className={wordmark} />
			</div>
		</a>
	);
}
